import { ipcMain, shell, type BrowserWindow } from 'electron';
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

  const h = createHandlers({
    pluginDir, pty, send,
    openPath: (p) => shell.openPath(p),
    onSessionStart: (dir) => { label = basename(dir); idle.reset(); send('pty:idle', false); },
    onSessionEnd: () => { idle.reset(); send('pty:idle', false); },
  });

  pty.on('data', (d: string) => { send('pty:data', d); idle.feed(); });
  pty.on('exit', (code: number) => { idle.reset(); send('pty:idle', false); send('pty:exit', code); });
  idle.on('idle', () => { send('pty:idle', true); attention.idle(label); });
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
