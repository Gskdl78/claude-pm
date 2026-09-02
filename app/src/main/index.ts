import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc';
import { PtyManager } from './pty';
import { getPluginDir } from './plugin-dir';

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    title: 'claude-pm',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.on('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  // The renderer only ever shows the bundled UI; a navigation would replace it.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

app.whenReady().then(() => {
  const win = createWindow();
  const pty = new PtyManager();
  registerIpc({ win, pty, pluginDir: getPluginDir() });
  app.on('before-quit', () => pty.kill());
});

app.on('window-all-closed', () => app.quit());
