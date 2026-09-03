import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

let fakeHome: string | null = null;

test.afterAll(() => {
  if (fakeHome) try { rmSync(fakeHome, { recursive: true, force: true }); } catch { /* 交給 OS */ }
});

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'pm-e2e-docs-'));
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

const PRD = `# PRD

一段文字，[任務清單](../tech/tasks.md)。

\`\`\`mermaid
graph TD
  A[開始] --> B[結束]
\`\`\`

| 欄 | 值 |
|---|---|
| x | 1 |
`;

const CHECKLIST = `# 人工驗證清單
啟動方式：npm run dev

## 流程 1
- [ ] 步驟 1 → 預期：ok
- [x] 步驟 2
`;

test('docs tab renders markdown with mermaid, navigates links and commits checklist toggles', async () => {
  const { home, root, appData, localAppData } = makeHome();
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData, LOCALAPPDATA: localAppData };
  const main = resolve('out/main/index.js');

  const app = await electron.launch({ args: [main], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText(root)).toBeVisible();

    // 用 App 自己的流程建立專案（scaffold 會 git init 並提交），再補上文件並提交。
    await page.getByRole('button', { name: '+ 新專案' }).click();
    await page.getByLabel('專案名稱').fill('docs-demo');
    await page.getByRole('button', { name: '建立', exact: true }).click();
    await expect(page.locator('.stage').getByText('環境搭建')).toBeVisible();

    const dir = join(root, 'docs-demo');
    mkdirSync(join(dir, 'docs', 'product'), { recursive: true });
    mkdirSync(join(dir, 'docs', 'tech'), { recursive: true });
    mkdirSync(join(dir, 'docs', 'verify'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'product', 'prd.md'), PRD);
    writeFileSync(join(dir, 'docs', 'tech', 'tasks.md'), '# Tasks\n\n- T1\n');
    writeFileSync(join(dir, 'docs', 'verify', 'checklist.md'), CHECKLIST);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, stdio: 'pipe' }).toString();
    git('add', '-A');
    git('commit', '-q', '-m', 'docs: seed');
    const before = git('rev-list', '--count', 'HEAD').trim();

    // 文件分頁：watcher 2 秒內會列出新檔案
    await page.getByRole('tab', { name: '文件' }).click();
    await page.getByRole('button', { name: 'product/prd.md' }).click({ timeout: 10_000 });
    const view = page.locator('.doc-view');
    await expect(view.getByRole('heading', { level: 1, name: 'PRD' })).toBeVisible();
    await expect(view.locator('table')).toBeVisible();
    // mermaid 在 file:// + CSP 下真的畫出 SVG
    await expect(view.locator('pre.mermaid.rendered svg')).toBeVisible({ timeout: 20_000 });
    await expect(view.locator('.mermaid-error')).toHaveCount(0);

    // 相對連結在 App 內跳轉
    await view.getByRole('link', { name: '任務清單' }).click();
    await expect(view.getByRole('heading', { level: 1, name: 'Tasks' })).toBeVisible();
    await expect(page.locator('.center-title')).toHaveText('docs/tech/tasks.md');

    // 驗證清單勾選 → 寫回檔案 → 只提交該檔
    await page.getByRole('button', { name: 'verify/checklist.md' }).click();
    const box = view.getByRole('checkbox', { name: '步驟 1 → 預期：ok' });
    await expect(box).toBeVisible();
    await box.click();
    await expect(box).toBeChecked();
    await expect(page.locator('.git-output')).toContainText('驗證清單已更新並提交', { timeout: 15_000 });
    await expect.poll(() => readFileSync(join(dir, 'docs', 'verify', 'checklist.md'), 'utf8')).toContain('- [x] 步驟 1');
    await expect.poll(() => git('rev-list', '--count', 'HEAD').trim()).toBe(String(Number(before) + 1));
    expect(git('log', '-1', '--format=%s').trim()).toBe('docs(verify): 更新清單');
    expect(git('show', '--stat', '--format=', 'HEAD')).toContain('docs/verify/checklist.md');

    // 切回終端機：xterm 仍在
    await page.getByRole('tab', { name: '終端機' }).click();
    await expect(page.locator('.xterm')).toBeVisible();
  } finally {
    await app.close();
  }
});
