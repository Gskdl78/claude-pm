import { ipcMain, shell, dialog, type BrowserWindow } from 'electron';
import { createHandlers } from './ipc-handlers';
import type { SessionManager } from './pty';
import { createAttention, createNotifyGate, electronNotify } from './attention';

export function registerIpc({ win, pty, pluginDir }: { win: BrowserWindow; pty: SessionManager; pluginDir: string }): void {
  const send = (channel: string, ...args: unknown[]) => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  };

  // 等待輸入偵測由 SessionManager 內建，每個 session 一個 IdleDetector
  const attention = createAttention({ win, notify: electronNotify(win) });
  // 每個 session 只通知一次，直到使用者對它輸入或切換到它（避免狀態列重繪造成的重複通知）
  const gate = createNotifyGate();

  // renderer 目前看的專案；其他 session 的閒置一律當背景通知
  let focusPath: string | null = null;
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
    // 啟動與結束都會由 SessionManager 送出 idle 事件，這裡不必再補送 pty:idle。
    onFocusChanged: (p) => { focusPath = p; if (p) gate.reset(p); },
    onUserInput: (dir) => gate.reset(dir),
  });
  void h['config:get']().then((cfg) => { notifyOnIdle = cfg.notifyOnIdle; });

  pty.on('data', (path: string, d: string) => send('pty:data', path, d));
  pty.on('exit', (path: string, code: number) => { gate.reset(path); send('pty:exit', path, code); });
  // 背景 session 等待輸入：使用者看不到它，所以即使視窗聚焦也通知。
  // 關掉通知只擋 attention.idle()；pty:idle 照送，UI 的等待輸入提示不受影響。
  pty.on('idle', (path: string, idle: boolean) => {
    send('pty:idle', path, idle);
    if (!idle || !notifyOnIdle) return;
    const background = path !== focusPath;
    // 目前專案且視窗聚焦：attention 自己會略過，不要消耗掉這個 session 的通知額度
    if (!background && win.isFocused()) return;
    if (gate.claim(path)) attention.idle(pty.label(path), { background });
  });

  const fireAndForget = new Set(['pty:write', 'pty:resize', 'pty:focus']);
  for (const [channel, fn] of Object.entries(h)) {
    if (channel === 'dispose') continue;
    const handler = fn as (...a: unknown[]) => unknown;
    if (fireAndForget.has(channel)) ipcMain.on(channel, (_e, ...a) => { handler(...a); });
    else ipcMain.handle(channel, (_e, ...a) => handler(...a));
  }
  win.on('closed', () => { pty.killAll(); h.dispose(); });
}
