import { ipcMain, shell, type BrowserWindow } from 'electron';
import { createHandlers } from './ipc-handlers';
import type { PtyManager } from './pty';

export function registerIpc({ win, pty, pluginDir }: { win: BrowserWindow; pty: PtyManager; pluginDir: string }): void {
  const send = (channel: string, ...args: unknown[]) => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  };
  const h = createHandlers({ pluginDir, pty, send, openPath: (p) => shell.openPath(p) });

  pty.on('data', (d: string) => send('pty:data', d));
  pty.on('exit', (code: number) => send('pty:exit', code));

  const fireAndForget = new Set(['pty:write', 'pty:resize']);
  for (const [channel, fn] of Object.entries(h)) {
    if (channel === 'dispose') continue;
    const handler = fn as (...a: unknown[]) => unknown;
    if (fireAndForget.has(channel)) ipcMain.on(channel, (_e, ...a) => { handler(...a); });
    else ipcMain.handle(channel, (_e, ...a) => handler(...a));
  }
  win.on('closed', () => h.dispose());
}
