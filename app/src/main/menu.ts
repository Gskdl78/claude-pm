import { Menu, type MenuItemConstructorOptions } from 'electron';

/**
 * The window uses `autoHideMenuBar`, so this menu is normally invisible — it
 * exists so the standard edit/view accelerators (Ctrl+C/V/A, Ctrl+R, zoom,
 * devtools) are registered at all. The terminal handles its own copy/paste
 * keys first and calls `preventDefault`, so these roles never double-fire
 * there; they serve the rest of the UI.
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
        { role: 'reload' },
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
