import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'pm-e2e-'));
  const root = join(home, 'Projects');
  mkdirSync(root);
  mkdirSync(join(home, '.claude-pm'));
  writeFileSync(join(home, '.claude-pm', 'config.json'), JSON.stringify({ root, lastProject: null, recent: [] }));
  // Chromium aborts at startup when USERPROFILE no longer matches APPDATA /
  // LOCALAPPDATA, so the fake home has to carry a matching AppData tree.
  const appData = join(home, 'AppData', 'Roaming');
  const localAppData = join(home, 'AppData', 'Local');
  mkdirSync(appData, { recursive: true });
  mkdirSync(localAppData, { recursive: true });
  // The fake home hides the real ~/.gitconfig, and scaffold's initial commit
  // fails without an identity.
  writeFileSync(join(home, '.gitconfig'), '[user]\n\tname = claude-pm e2e\n\temail = e2e@example.invalid\n');
  return { home, root, appData, localAppData };
}

test('creates a project, shows stage panel, and restores it after relaunch', async () => {
  const { home, root, appData, localAppData } = makeHome();
  // os.homedir() on Windows follows USERPROFILE; HOME covers the posix case.
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData, LOCALAPPDATA: localAppData };
  const main = resolve('out/main/index.js');

  let app = await electron.launch({ args: [main], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText(root)).toBeVisible();

    await page.getByRole('button', { name: '+ 新專案' }).click();
    await page.getByLabel('專案名稱').fill('e2e-demo');
    await page.getByRole('button', { name: '建立' }).click();

    await expect(page.locator('.stage').getByText('環境搭建')).toBeVisible();
    await expect(page.locator('.xterm')).toBeVisible();
  } finally {
    // Always close: the opened project auto-starts a real claude pty.
    await app.close();
  }

  app = await electron.launch({ args: [main], env });
  try {
    const page = await app.firstWindow();
    await expect(page.locator('.project.active')).toHaveText(/e2e-demo/);
  } finally {
    await app.close();
  }
});
