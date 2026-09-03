import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let fakeHome: string | null = null;

test.afterAll(() => {
  if (fakeHome) try { rmSync(fakeHome, { recursive: true, force: true }); } catch { /* 交給 OS */ }
});

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'pm-e2e-settings-'));
  fakeHome = home;
  const root = join(home, 'Projects');
  mkdirSync(root);
  mkdirSync(join(home, '.claude-pm'));
  writeFileSync(join(home, '.claude-pm', 'config.json'), JSON.stringify({ root, lastProject: null, recent: [] }));
  const appData = join(home, 'AppData', 'Roaming');
  const localAppData = join(home, 'AppData', 'Local');
  mkdirSync(appData, { recursive: true });
  mkdirSync(localAppData, { recursive: true });
  writeFileSync(join(home, '.gitconfig'), '[user]\n\tname = claude-pm e2e\n\temail = e2e@example.invalid\n');
  return { home, root, appData, localAppData };
}

test('settings dialog saves to config.json and new projects carry the model policy', async () => {
  const { home, root, appData, localAppData } = makeHome();
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData, LOCALAPPDATA: localAppData };
  const main = resolve('out/main/index.js');

  const app = await electron.launch({ args: [main], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText(root)).toBeVisible();

    await page.getByRole('button', { name: '設定' }).click();
    const dialog = page.getByRole('dialog', { name: '設定' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('預設實作模型')).toHaveValue('opus');
    await dialog.getByLabel('預設實作模型').selectOption('sonnet');
    await dialog.getByLabel('審核退回上限').fill('2');
    await dialog.getByLabel('終端機字型大小').fill('18');
    await dialog.getByRole('button', { name: '儲存' }).click();
    await expect(dialog).toBeHidden();

    const cfg = JSON.parse(readFileSync(join(home, '.claude-pm', 'config.json'), 'utf8'));
    expect(cfg).toMatchObject({ implModel: 'sonnet', reviewModel: 'fable', maxRetries: 2, termFontSize: 18 });

    // 新專案的 CLAUDE.md 帶入設定的模型政策
    await page.getByRole('button', { name: '+ 新專案' }).click();
    await page.getByLabel('專案名稱').fill('policy-demo');
    await page.getByRole('button', { name: '建立' }).click();
    await expect(page.locator('.stage').getByText('環境搭建')).toBeVisible();
    const claude = readFileSync(join(root, 'policy-demo', 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('實作 subagent：`sonnet`');
    expect(claude).toContain('審核退回上限 2 次');

    // 終端機字級真的套用到 xterm
    const fontSize = await page.locator('.xterm').evaluate((el) => getComputedStyle(el.querySelector('.xterm-rows') ?? el).fontSize);
    expect(fontSize).toBe('18px');
  } finally {
    await app.close();
  }
});
