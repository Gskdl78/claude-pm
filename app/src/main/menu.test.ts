import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn() } }));

const { buildMenuTemplate } = await import('./menu');

function roles(label: string): string[] {
  const menu = buildMenuTemplate().find((m) => m.label === label);
  const items = (menu?.submenu ?? []) as Array<{ role?: string }>;
  return items.map((i) => i.role).filter((r): r is string => Boolean(r));
}

describe('application menu', () => {
  // autoHideMenuBar hides this menu, so its only job is to register the
  // standard accelerators; a missing role means a dead shortcut.
  it('registers the edit roles', () => {
    expect(roles('編輯')).toEqual(['copy', 'paste', 'selectAll']);
  });

  it('registers the view roles', () => {
    expect(roles('檢視')).toEqual(['toggleDevTools', 'resetZoom', 'zoomIn', 'zoomOut']);
  });

  // reload/forceReload bind Ctrl+R / Ctrl+Shift+R as global accelerators,
  // which would reload the window (killing the pty session) whenever a user
  // presses Ctrl+R in the terminal for shell reverse-search.
  it('does not register reload or forceReload', () => {
    const all = roles('編輯').concat(roles('檢視'));
    expect(all).not.toContain('reload');
    expect(all).not.toContain('forceReload');
  });
});
