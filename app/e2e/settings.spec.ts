import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** 主行程 pty:list 的回傳；e2e 不吃 shared/types，就地宣告即可。 */
type SessionInfo = { path: string; label: string; running: boolean; idle: boolean };
type PmWindow = { pm: { pty: { list(): Promise<SessionInfo[]> } } };

let fakeHome: string | null = null;

test.afterAll(() => {
  if (fakeHome) try { rmSync(fakeHome, { recursive: true, force: true }); } catch { /* 交給 OS */ }
});

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'pm-e2e-settings-'));
  fakeHome = home;
  const root = join(home, 'Projects');
  mkdirSync(root);
  // 換根目錄的步驟要有第二個現成的資料夾
  const root2 = join(home, 'Projects2');
  mkdirSync(root2);
  mkdirSync(join(home, '.claude-pm'));
  writeFileSync(join(home, '.claude-pm', 'config.json'), JSON.stringify({ root, lastProject: null, recent: [] }));
  const appData = join(home, 'AppData', 'Roaming');
  const localAppData = join(home, 'AppData', 'Local');
  mkdirSync(appData, { recursive: true });
  mkdirSync(localAppData, { recursive: true });
  writeFileSync(join(home, '.gitconfig'), '[user]\n\tname = claude-pm e2e\n\temail = e2e@example.invalid\n');
  return { home, root, root2, appData, localAppData };
}

test('settings dialog saves to config.json and new projects carry the model policy', async () => {
  const { home, root, root2, appData, localAppData } = makeHome();
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
    await page.getByRole('button', { name: '建立', exact: true }).click();
    await expect(page.locator('.stage').getByText('環境搭建')).toBeVisible();
    const claude = readFileSync(join(root, 'policy-demo', 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('實作 subagent：`sonnet`');
    expect(claude).toContain('審核退回上限 2 次');

    // 終端機字級真的套用到 xterm
    const fontSize = await page.locator('.xterm').evaluate((el) => getComputedStyle(el.querySelector('.xterm-rows') ?? el).fontSize);
    expect(fontSize).toBe('18px');

    // 換根目錄：舊路徑之後會被 root 守衛擋下，主行程必須自己把 session 收乾淨
    await expect.poll(async () => (await page.evaluate(() => (window as unknown as PmWindow).pm.pty.list())).length, { timeout: 15_000 }).toBe(1);
    await page.getByRole('button', { name: '設定' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('專案根目錄').fill(root2);
    await dialog.getByRole('button', { name: '儲存' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(root2)).toBeVisible();
    await expect.poll(async () => (await page.evaluate(() => (window as unknown as PmWindow).pm.pty.list())).length, { timeout: 15_000 }).toBe(0);
  } finally {
    await app.close();
  }
});
