import { ipcMain, shell, dialog, type BrowserWindow } from 'electron';
import { basename } from 'node:path';
import { createHandlers } from './ipc-handlers';
import type { PtyManager } from './pty';
import { IdleDetector } from './pty-idle';
import { createAttention, electronNotify } from './attention';

export function registerIpc({ win, pty, pluginDir }: { win: BrowserWindow; pty: PtyManager; pluginDir: string }): void {
  const send = (channel: string, ...args: unknown[]) => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  };

  // 等待輸入偵測：3 秒無輸出 → pty:idle true；有輸出 → false；未聚焦時閃爍並通知
  const idle = new IdleDetector();
  const attention = createAttention({ win, notify: electronNotify(win) });
  let label = '';

  // 通知開關快取：persist() 每次呼叫 onConfigChanged，這裡不必再查
  let notifyOnIdle = true;
  const h = createHandlers({
    pluginDir, pty, send,
    openPath: (p) => shell.openPath(p),
    openExternal: (u) => shell.openExternal(u),
    pickFolder: async (defaultPath) => {
      const r = await dialog.showOpenDialog(win, { defaultPath, properties: ['openDirectory', 'createDirectory'] });
      return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
    },
    onConfigChanged: (cfg) => { notifyOnIdle = cfg.notifyOnIdle; },
    onSessionStart: (dir) => { label = basename(dir); idle.reset(); send('pty:idle', false); },
    onSessionEnd: () => { idle.reset(); send('pty:idle', false); },
  });
  void h['config:get']().then((cfg) => { notifyOnIdle = cfg.notifyOnIdle; });

  pty.on('data', (d: string) => { send('pty:data', d); idle.feed(); });
  pty.on('exit', (code: number) => { idle.reset(); send('pty:idle', false); send('pty:exit', code); });
  // 關掉通知只擋 attention.idle()；pty:idle 照送，UI 的等待輸入提示不受影響。
  idle.on('idle', () => { send('pty:idle', true); if (notifyOnIdle) attention.idle(label); });
  idle.on('busy', () => { send('pty:idle', false); attention.busy(); });

  const fireAndForget = new Set(['pty:write', 'pty:resize']);
  for (const [channel, fn] of Object.entries(h)) {
    if (channel === 'dispose') continue;
    const handler = fn as (...a: unknown[]) => unknown;
    if (fireAndForget.has(channel)) ipcMain.on(channel, (_e, ...a) => { handler(...a); });
    else ipcMain.handle(channel, (_e, ...a) => handler(...a));
  }
  win.on('closed', () => { idle.reset(); h.dispose(); });
}
