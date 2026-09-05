import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

let fakeHome: string | null = null;

test.afterAll(() => {
  if (fakeHome) try { rmSync(fakeHome, { recursive: true, force: true }); } catch { /* 交給 OS */ }
});

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'pm-e2e-skills-'));
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

const SKILL_MD = `---
name: demo
description: e2e 用的示範 skill
---

做一件事。
`;

test('takes a local skill through trial, adopt and promote to global', async () => {
  const { home, root, appData, localAppData } = makeHome();
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData, LOCALAPPDATA: localAppData };
  const main = resolve('out/main/index.js');

  // 來源：home 底下一個含 SKILL.md 的資料夾（貼絕對路徑，不必連外網）
  const src = join(home, 'src-skill', 'demo');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'SKILL.md'), SKILL_MD);

  const app = await electron.launch({ args: [main], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText(root)).toBeVisible();

    await page.getByRole('button', { name: '+ 新專案' }).click();
    await page.getByLabel('專案名稱').fill('skill-demo');
    await page.getByRole('button', { name: '建立', exact: true }).click();
    await expect(page.locator('.stage').getByText('環境搭建')).toBeVisible();

    const dir = join(root, 'skill-demo');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, stdio: 'pipe' }).toString();

    // 取得 → 只有一個 skill，直接進報告頁
    await page.getByRole('button', { name: 'Skills' }).click();
    await page.getByRole('button', { name: '加入 skill' }).click();
    await page.getByLabel('skill 來源').fill(src);
    await page.getByRole('button', { name: '取得' }).click();
    await expect(page.getByText('e2e 用的示範 skill')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/不是安全保證/)).toBeVisible();

    // 試用：檔案進專案，但 git 看不到（被 .git/info/exclude 藏起來）
    await page.getByRole('button', { name: '試用' }).click();
    await expect(page.getByRole('button', { name: '採用 demo' })).toBeVisible({ timeout: 15_000 });
    expect(existsSync(join(dir, '.claude', 'skills', 'demo', 'SKILL.md'))).toBe(true);
    expect(git('status', '--porcelain')).not.toContain('demo');

    // 點名稱看說明（讀 SKILL.md 的 frontmatter，不花 token）
    await page.getByRole('button', { name: 'demo', exact: true }).click();
    await expect(page.locator('.skill-desc')).toHaveText('e2e 用的示範 skill');
    await page.getByRole('button', { name: 'demo', exact: true }).click();
    await expect(page.locator('.skill-desc')).toHaveCount(0);

    // 採用：多一個 commit，exclude 行消失
    const before = Number(git('rev-list', '--count', 'HEAD').trim());
    await page.getByRole('button', { name: '採用 demo' }).click();
    await expect.poll(() => Number(git('rev-list', '--count', 'HEAD').trim()), { timeout: 15_000 }).toBe(before + 1);
    expect(git('log', '-1', '--format=%s').trim()).toBe('chore(skills): 採用 demo');

    // 升為全域：專案那份消失（並 commit 刪除），全域出現
    await page.getByRole('button', { name: '升為全域 demo' }).click();
    // 全域狀態沒有「升為全域」按鈕，它消失才代表整個搬移（含 git rm 與 commit）跑完
    await expect(page.getByRole('button', { name: '升為全域 demo' })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('.skill-badge.global')).toBeVisible();
    expect(existsSync(join(home, '.claude', 'skills', 'demo', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude', 'skills', 'demo'))).toBe(false);
    expect(git('status', '--porcelain').trim()).toBe('');

    // 不合法的來源：對話框顯示白話錯誤，不建立任何東西
    await page.getByRole('button', { name: '加入 skill' }).click();
    await page.getByLabel('skill 來源').fill('javascript:alert(1)');
    await page.getByRole('button', { name: '取得' }).click();
    await expect(page.getByText('取得失敗，詳情看下方輸出。')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.git-output')).toContainText('看不懂這個來源');
  } finally {
    await app.close();
  }
});
