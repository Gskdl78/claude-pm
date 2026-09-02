import { Menu, type MenuItemConstructorOptions } from 'electron';

/**
 * The window uses `autoHideMenuBar`, so this menu is normally invisible — it
 * exists so the standard edit/view accelerators (Ctrl+C/V/A, zoom, devtools)
 * are registered at all. The Edit roles never register accelerators of their
 * own, so the terminal's own copy/paste handling (which calls
 * `preventDefault`) is what actually wins there. The View roles DO register
 * global accelerators, which is why `reload`/`forceReload` are intentionally
 * left out: Electron would bind them to Ctrl+R / Ctrl+Shift+R ahead of the
 * terminal, killing the shell session whenever a user presses Ctrl+R for
 * reverse-search.
 */
export function buildMenuTemplate(): MenuItemConstructorOptions[] {
  return [
    {
      label: '編輯',
      submenu: [
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '檢視',
      submenu: [
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
  ];
}

export function installAppMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate()));
}
