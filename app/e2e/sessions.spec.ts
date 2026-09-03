import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** 主行程 pty:list 的回傳；e2e 不吃 shared/types，就地宣告即可。 */
type SessionInfo = { path: string; label: string; running: boolean; idle: boolean };
type PmWindow = { pm: { pty: { list(): Promise<SessionInfo[]> } } };

let fakeHome: string | null = null;

test.afterAll(() => {
  // Best effort：還沒收乾淨的 claude / pty handle 可能仍占著檔案。
  if (fakeHome) try { rmSync(fakeHome, { recursive: true, force: true }); } catch { /* 交給 OS */ }
});

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'pm-e2e-sessions-'));
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

async function createProject(page: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>['firstWindow']>>, name: string) {
  await page.getByRole('button', { name: '+ 新專案' }).click();
  await page.getByLabel('專案名稱').fill(name);
  await page.getByRole('button', { name: '建立' }).click();
  await expect(page.locator('.project.active')).toHaveText(new RegExp(name));
  await expect(page.locator('.stage').getByText('環境搭建')).toBeVisible();
}

test('keeps a session per project and closes one from the sidebar', async () => {
  const { home, root, appData, localAppData } = makeHome();
  const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData, LOCALAPPDATA: localAppData };
  const main = resolve('out/main/index.js');

  const app = await electron.launch({ args: [main], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText(root)).toBeVisible();

    // 兩個專案各自自動啟動一個 claude session
    await createProject(page, 's1');
    await expect(page.locator('.xterm-host:not([hidden])')).toHaveCount(1);

    // 記下 s1 畫面上的內容，切走再切回來必須還是同一份（沒有被重開）
    let s1Sample = '';
    await expect.poll(async () => {
      s1Sample = (await page.locator('.xterm-host:not([hidden])').innerText()).replace(/\s+/g, '').slice(0, 20);
      return s1Sample.length;
    }, { timeout: 30_000 }).toBeGreaterThan(0);

    await createProject(page, 's2');

    const s1 = page.locator('.project', { hasText: 's1' });
    const s2 = page.locator('.project', { hasText: 's2' });
    // 切到 s2 之後 s1 的 session 仍活著（停在提示符時綠點會換成黃點）
    await expect(s1.locator('.pill.live, .pill.waiting')).toHaveText(/● (執行中|等待回覆)/);
    await expect(s1.getByRole('button', { name: '關閉 session' })).toBeVisible();

    // 主行程有兩個 pty，但畫面上只有目前專案的終端機
    await expect.poll(async () => (await page.evaluate(() => (window as unknown as PmWindow).pm.pty.list())).length, { timeout: 15_000 }).toBe(2);
    await expect(page.locator('.xterm-host:not([hidden])')).toHaveCount(1);

    // 切回 s1：捲軸內容還在，而且 pty 沒有重開
    await s1.click();
    await expect(page.locator('.project.active')).toHaveText(/s1/);
    await expect.poll(async () => (await page.locator('.xterm-host:not([hidden])').innerText()).replace(/\s+/g, ''), { timeout: 15_000 }).toContain(s1Sample);
    expect((await page.evaluate(() => (window as unknown as PmWindow).pm.pty.list())).length).toBe(2);

    await s2.click();
    await expect(page.locator('.project.active')).toHaveText(/s2/);

    // 關閉目前專案（s2）的 session：確認後只剩 s1 的 pty，s2 的 pill 消失
    await s2.getByRole('button', { name: '關閉 session' }).click();
    await expect(page.getByRole('dialog').getByText('關閉 session')).toBeVisible();
    await page.getByRole('button', { name: '確認' }).click();

    await expect.poll(async () => (await page.evaluate(() => (window as unknown as PmWindow).pm.pty.list())).length, { timeout: 15_000 }).toBe(1);
    await expect(s2.locator('.pill.live, .pill.waiting')).toHaveCount(0);
    await expect(s2.getByRole('button', { name: '關閉 session' })).toHaveCount(0);
    await expect(page.locator('.term .overlay')).toContainText('Claude Code 已結束');
    await expect(s1.getByRole('button', { name: '關閉 session' })).toBeVisible();
  } finally {
    await app.close();
  }
});
