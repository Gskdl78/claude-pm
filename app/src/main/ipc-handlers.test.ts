import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHandlers, type HandlerDeps } from './ipc-handlers';
import { SessionManager, type SpawnFn } from './pty';

const PLUGIN_DIR = resolve(__dirname, '../../../plugin');

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'pm-test', GIT_AUTHOR_EMAIL: 'pm-test@local',
    GIT_COMMITTER_NAME: 'pm-test', GIT_COMMITTER_EMAIL: 'pm-test@local',
  });
});

function setup(extra: Partial<Pick<HandlerDeps, 'onSessionStart' | 'onSessionEnd' | 'onFocusChanged' | 'watchIntervalMs' | 'pty' | 'openExternal' | 'pickFolder' | 'onConfigChanged' | 'pinnedFile' | 'onUserInput'>> = {}) {
  const base = mkdtempSync(join(tmpdir(), 'pm-ipc-'));
  const root = join(base, 'root');
  mkdirSync(root);
  const configFile = join(base, 'config.json');
  writeFileSync(configFile, JSON.stringify({ root, lastProject: null, recent: [] }));
  const spawnCalls: Array<{ file: string; args: string[]; cwd: string; cols: number; rows: number }> = [];
  // 每個 proc 都往同一個陣列記錄，第一欄是它的 cwd：可驗證輸入被送到正確的 session
  const writes: Array<[string, unknown]> = [];
  const resizes: Array<[unknown, unknown]> = [];
  // 被終止的行程；用來驗證 config:setRoot 真的收掉了舊 root 的 session
  const kills: string[] = [];
  const spawn: SpawnFn = (file, args, opts) => {
    spawnCalls.push({ file, args, cwd: opts.cwd, cols: opts.cols, rows: opts.rows });
    return {
      onData() {}, onExit() {}, kill() { kills.push(opts.cwd); },
      write(d) { writes.push([opts.cwd, d]); },
      resize(c, r) { resizes.push([c, r]); },
    };
  };
  const pty = new SessionManager(spawn);
  const send = vi.fn();
  const openPath = vi.fn(async () => '');
  // 釘選檔一定要落在暫存目錄裡，測試不可寫到真實家目錄。
  const h = createHandlers({ pluginDir: PLUGIN_DIR, configFile, pty, send, openPath, checkClaude: async () => ({ ok: true, path: 'x' }), pinnedFile: join(base, 'pinned-notes.md'), watchIntervalMs: 30, ...extra });
  return { base, root, configFile, h, send, spawnCalls, openPath, writes, resizes, kills };
}

describe('ipc handlers', () => {
  it('config get/setRoot', async () => {
    const { h, root, base } = setup();
    expect((await h['config:get']()).root).toBe(root);
    await expect(h['config:setRoot'](join(base, 'missing'))).rejects.toThrow(/root not found/);
    const other = join(base, 'other'); mkdirSync(other);
    expect((await h['config:setRoot'](other)).root).toBe(other);
  });

  it('config:setRoot kills every session before the new root makes them unreachable', async () => {
    const onSessionEnd = vi.fn();
    const onFocusChanged = vi.fn();
    const { h, base, kills } = setup({ onSessionEnd, onFocusChanged });
    const created = await h['projects:create']('demo');
    await h['pty:start'](created.path, { continue: false, cols: 80, rows: 24 });
    expect((await h['pty:list']()).map((s) => s.path)).toEqual([created.path]);

    const other = join(base, 'other'); mkdirSync(other);
    await h['config:setRoot'](other);
    // 換根目錄之後 renderer 再也殺不掉舊路徑，所以主行程必須自己收乾淨
    expect(await h['pty:list']()).toEqual([]);
    expect(kills).toEqual([created.path]);
    expect(onSessionEnd).toHaveBeenCalledWith(created.path);
    expect(onFocusChanged).toHaveBeenLastCalledWith(null);
    h.dispose();
  });

  it('create → list → open remembers project and starts pty with /stage-env', async () => {
    const { h, root, send, spawnCalls, configFile } = setup();
    const created = await h['projects:create']('demo');
    expect(created.initialized).toBe(true);
    expect((await h['projects:list']()).map((p) => p.name)).toEqual(['demo']);

    const opened = await h['projects:open'](created.path);
    expect(opened.path).toBe(join(root, 'demo'));
    expect(JSON.parse(readFileSync(configFile, 'utf8')).lastProject).toBe(created.path);

    await h['pty:start'](created.path, { continue: false, initialPrompt: '/stage-env', cols: 80, rows: 24 });
    const call = spawnCalls[0];
    expect(call.cwd).toBe(created.path);
    expect(call.args.slice(-1)).toEqual(['/stage-env']);
    expect(call.args).toContain('claude');

    await h['pty:start'](created.path, { continue: true, cols: 80, rows: 24 });
    expect(spawnCalls[1].args.slice(-1)).toEqual(['--continue']);

    // watcher 會把 state 變更推給 renderer
    writeFileSync(join(created.path, '.pm', 'state.json'), JSON.stringify({ ...opened.state, stage: 'design' }));
    await new Promise((r) => setTimeout(r, 900));
    expect(send).toHaveBeenCalledWith('project:state', expect.objectContaining({ path: created.path }));
    h.dispose();
  });

  it('guards every path-taking handler', async () => {
    const { h, base } = setup();
    const outside = join(base, 'outside'); mkdirSync(outside);
    await expect(h['projects:open'](outside)).rejects.toThrow(/path outside root/);
    await expect(h['projects:init'](outside)).rejects.toThrow(/path outside root/);
    await expect(h['projects:rebuild'](outside)).rejects.toThrow(/path outside root/);
    await expect(h['git:log'](outside)).rejects.toThrow(/path outside root/);
    await expect(h['shell:openPath'](join(outside, 'a.md'))).rejects.toThrow(/path outside root/);
    await expect(h['pty:start'](outside, { continue: false, cols: 1, rows: 1 })).rejects.toThrow(/path outside root/);
    await expect(h['git:status'](outside)).rejects.toThrow(/path outside root/);
    await expect(h['git:run'](outside, { kind: 'fetch' })).rejects.toThrow(/path outside root/);
    await expect(h['git:extras'](outside)).rejects.toThrow(/path outside root/);
    await expect(h['gh:check'](outside)).rejects.toThrow(/path outside root/);
    await expect(h['gh:repoCreate'](outside, 'x', true)).rejects.toThrow(/path outside root/);
  });

  it('accepts only slash-command initialPrompts', async () => {
    const { h, spawnCalls } = setup();
    const p = await h['projects:create']('guarded');
    const size = { cols: 80, rows: 24 };
    await expect(h['pty:start'](p.path, { continue: false, initialPrompt: 'x&calc', ...size }))
      .rejects.toThrow(/invalid initialPrompt/);
    await expect(h['pty:start'](p.path, { continue: false, initialPrompt: '/stage env', ...size }))
      .rejects.toThrow(/invalid initialPrompt/);
    await expect(h['pty:start'](p.path, { continue: false, initialPrompt: '--dangerously-skip', ...size }))
      .rejects.toThrow(/invalid initialPrompt/);
    expect(spawnCalls).toHaveLength(0);

    await h['pty:start'](p.path, { continue: false, initialPrompt: '/stage-env', ...size });
    expect(spawnCalls[0].args.slice(-1)).toEqual(['/stage-env']);
    await h['pty:start'](p.path, { continue: false, ...size });
    expect(spawnCalls[1].args).not.toContain('/stage-env');
  });

  it('clamps pty size to sane integers', async () => {
    const { h, spawnCalls } = setup();
    const p = await h['projects:create']('sized');
    await h['pty:start'](p.path, { continue: true, cols: 'x' as unknown as number, rows: Number.NaN });
    expect(spawnCalls[0].cols).toBe(80);
    expect(spawnCalls[0].rows).toBe(24);
    await h['pty:start'](p.path, { continue: true, cols: 0, rows: 99999 });
    expect(spawnCalls[1].cols).toBe(1);
    expect(spawnCalls[1].rows).toBe(500);
    await h['pty:start'](p.path, { continue: true, cols: 120.7, rows: 30 });
    expect(spawnCalls[2].cols).toBe(120);
    expect(spawnCalls[2].rows).toBe(30);
  });

  it('ignores malformed pty write/resize instead of forwarding them', async () => {
    const { h, writes, resizes } = setup();
    const p = await h['projects:create']('io');
    await h['pty:start'](p.path, { continue: true, cols: 80, rows: 24 });

    h['pty:write'](p.path, 'ok');
    h['pty:write'](p.path, 123 as unknown as string);
    h['pty:write'](p.path, undefined as unknown as string);
    expect(writes).toEqual([[p.path, 'ok']]);

    h['pty:resize'](p.path, 10, 20);
    h['pty:resize'](p.path, Number.POSITIVE_INFINITY, 20);
    h['pty:resize'](p.path, 10, Number.NaN);
    h['pty:resize'](p.path, '10' as unknown as number, 20);
    expect(resizes).toEqual([[10, 20]]);
  });

  it('list clears a lastProject whose folder was deleted', async () => {
    const { h, configFile } = setup();
    const p = await h['projects:create']('gone');
    await h['projects:open'](p.path);
    h.dispose();
    rmSync(p.path, { recursive: true, force: true });
    await h['projects:list']();
    expect(JSON.parse(readFileSync(configFile, 'utf8')).lastProject).toBeNull();
  });

  it('init existing, rebuild, git log, openPath, claude check', async () => {
    const { h, root, openPath } = setup();
    const dir = join(root, 'old'); mkdirSync(dir);
    const info = await h['projects:init'](dir);
    expect(info.initialized).toBe(true);
    writeFileSync(join(dir, '.pm', 'state.json'), 'bad');
    expect((await h['projects:rebuild'](dir)).state?.stage).toBe('env');
    const log = await h['git:log'](dir, 5);
    expect(log[0].message).toBe('chore: init project');
    await h['shell:openPath'](join(dir, 'CLAUDE.md'));
    expect(openPath).toHaveBeenCalledWith(join(dir, 'CLAUDE.md'));
    expect(await h['claude:check']()).toEqual({ ok: true, path: 'x' });
    expect(existsSync(join(dir, '.claude'))).toBe(true);
  });
  it('pty:start reports the session directory through onSessionStart', async () => {
    const onSessionStart = vi.fn();
    const { h, root } = setup({ onSessionStart });
    const created = await h['projects:create']('demo');
    await h['projects:open'](created.path);
    await h['pty:start'](created.path, { continue: false, cols: 80, rows: 24 });
    expect(onSessionStart).toHaveBeenCalledWith(join(root, 'demo'));
  });

  it('pty:start does not call onSessionStart when the path is outside root', async () => {
    const onSessionStart = vi.fn();
    const { h, base } = setup({ onSessionStart });
    await expect(h['pty:start'](join(base, 'outside'), { continue: false, cols: 80, rows: 24 })).rejects.toThrow();
    expect(onSessionStart).not.toHaveBeenCalled();
  });

  it('pty:start does not call onSessionStart when the spawn fails', async () => {
    const onSessionStart = vi.fn();
    const onSessionEnd = vi.fn();
    const throwing: SpawnFn = () => { throw new Error('spawn failed'); };
    const { h } = setup({ onSessionStart, onSessionEnd, pty: new SessionManager(throwing) });
    const created = await h['projects:create']('broken');
    await expect(h['pty:start'](created.path, { continue: false, cols: 80, rows: 24 })).rejects.toThrow(/spawn failed/);
    expect(onSessionStart).not.toHaveBeenCalled();
    // 失敗也要結束上一個 session，否則舊的閒置計時器會送出幽靈通知。
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
  });

  it('pty:kill reports the end of the session through onSessionEnd', async () => {
    const onSessionEnd = vi.fn();
    const { h } = setup({ onSessionEnd });
    const created = await h['projects:create']('killed');
    await h['pty:start'](created.path, { continue: false, cols: 80, rows: 24 });
    await h['pty:kill'](created.path);
    expect(onSessionEnd).toHaveBeenCalledWith(created.path);
  });

  it('shell:openExternal only accepts http(s) and mailto', async () => {
    const openExternal = vi.fn(async () => {});
    const { h } = setup({ openExternal });
    await h['shell:openExternal']('https://example.com/x');
    await h['shell:openExternal']('mailto:a@b.c');
    expect(openExternal).toHaveBeenCalledTimes(2);
    for (const bad of ['file:///C:/x', 'javascript:alert(1)', 'ftp://x', '', 'https://' + 'a'.repeat(3000)]) {
      await expect(h['shell:openExternal'](bad)).rejects.toThrow(/invalid url/);
    }
    expect(openExternal).toHaveBeenCalledTimes(2);
  });

  it('shell:openPath refuses executable files but still opens documents', async () => {
    const { h, root, openPath } = setup();
    writeFileSync(join(root, 'x.bat'), 'echo hi');
    writeFileSync(join(root, 'a.md'), '# a');
    await expect(h['shell:openPath'](join(root, 'x.bat'))).rejects.toThrow(/refusing to open executable file/);
    expect(openPath).not.toHaveBeenCalled();
    await h['shell:openPath'](join(root, 'a.md'));
    expect(openPath).toHaveBeenCalledWith(join(root, 'a.md'));
  });

  it('docs handlers are exposed and guarded', async () => {
    const { h } = setup();
    const created = await h['projects:create']('demo');
    mkdirSync(join(created.path, 'docs'), { recursive: true });
    writeFileSync(join(created.path, 'docs', 'a.md'), '# a');
    expect((await h['docs:list'](created.path)).map((d) => d.rel)).toEqual(['docs/a.md']);
    await expect(h['docs:read'](join(created.path, '..', '..', 'x'), 'docs/a.md')).rejects.toThrow();
  });

  it('config:update validates, persists and notifies', async () => {
    const onConfigChanged = vi.fn();
    const { h, configFile } = setup({ onConfigChanged });
    const cfg = await h['config:update']({ implModel: 'sonnet', termFontSize: 16, notifyOnIdle: false });
    expect(cfg).toMatchObject({ implModel: 'sonnet', termFontSize: 16, notifyOnIdle: false, reviewModel: 'fable' });
    expect(JSON.parse(readFileSync(configFile, 'utf8'))).toMatchObject({ implModel: 'sonnet', termFontSize: 16 });
    expect(onConfigChanged).toHaveBeenCalledWith(expect.objectContaining({ implModel: 'sonnet' }));
    await expect(h['config:update']({ maxRetries: 99 })).rejects.toThrow(/invalid maxRetries/);
    await expect(h['config:update']({ root: 'X' } as never)).resolves.toMatchObject({ root: (await h['config:get']()).root });
  });

  it('config:update keeps the cached config when the write fails', async () => {
    const onConfigChanged = vi.fn();
    const { base } = setup();
    // 讓 saveConfig 一定失敗：設定檔的上層「目錄」其實是一個檔案，mkdirSync 會丟錯
    const blocker = join(base, 'blocker');
    writeFileSync(blocker, 'not a directory');
    const h = createHandlers({
      pluginDir: PLUGIN_DIR, configFile: join(blocker, 'config.json'),
      pty: new SessionManager((() => { throw new Error('pty unused'); }) as unknown as SpawnFn),
      send: vi.fn(), checkClaude: async () => ({ ok: true, path: 'x' }), onConfigChanged,
    });
    expect(await h['config:get']()).toMatchObject({ implModel: 'opus', termFontSize: 14 });
    await expect(h['config:update']({ implModel: 'sonnet', termFontSize: 20 })).rejects.toThrow();
    // 沒寫進磁碟就不能換快取，否則重開後設定會跳回舊值
    expect(await h['config:get']()).toMatchObject({ implModel: 'opus', termFontSize: 14 });
    expect(onConfigChanged).not.toHaveBeenCalled();
    h.dispose();
  });

  it('dialog:pickFolder forwards to the injected picker with the current root', async () => {
    const pickFolder = vi.fn(async () => 'D:\\Chosen');
    const { h, root } = setup({ pickFolder });
    expect(await h['dialog:pickFolder']()).toBe('D:\\Chosen');
    expect(pickFolder).toHaveBeenCalledWith(root);
    const { h: h2 } = setup();
    expect(await h2['dialog:pickFolder']()).toBeNull();
  });

  it('projects:create uses the configured model policy', async () => {
    const { h } = setup();
    await h['config:update']({ implModel: 'sonnet', maxRetries: 2 });
    const created = await h['projects:create']('policy');
    const claude = readFileSync(join(created.path, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('實作 subagent：`sonnet`');
    expect(claude).toContain('審核退回上限 2 次');
  });

  it('insights:collect reads every project under root', async () => {
    const { h } = setup();
    const a = await h['projects:create']('ia');
    const s = JSON.parse(readFileSync(join(a.path, '.pm', 'state.json'), 'utf8'));
    s.issues = [{ id: 1, stage: 'build', task: null, symptom: 's', cause: 'root cause', fix: 'fix it', commit: 'abc1234', at: '2026-09-01T00:00:00Z' }];
    writeFileSync(join(a.path, '.pm', 'state.json'), JSON.stringify(s));
    const r = await h['insights:collect']();
    expect(r.projects).toBe(1);
    expect(r.items.map((i) => i.cause)).toEqual(['root cause']);
  });

  it('insights pin/unpin validate and persist, and new projects carry the pinned notes', async () => {
    const { h, base } = setup();
    expect(await h['insights:pinned']()).toEqual([]);
    const after = await h['insights:pin']({ cause: 'Env 缺少 .env', fix: '加 .env.example' });
    expect(after).toEqual([{ cause: 'Env 缺少 .env', fix: '加 .env.example' }]);
    expect(readFileSync(join(base, 'pinned-notes.md'), 'utf8')).toBe('- Env 缺少 .env → 建議：加 .env.example\n');
    await expect(h['insights:pin']({ cause: '', fix: 'x' })).rejects.toThrow(/須為單行/);
    const created = await h['projects:create']('pinned');
    // 範本在 Windows 上可能以 CRLF 簽出，斷言跨行內容前先正規化換行。
    expect(readFileSync(join(created.path, 'CLAUDE.md'), 'utf8').replace(/\r\n/g, '\n'))
      .toContain('## 固定注意事項\n- Env 缺少 .env → 建議：加 .env.example');
    expect(await h['insights:unpin']('env 缺少 .env')).toEqual([]);
    await expect(h['insights:unpin'](5 as unknown as string)).rejects.toThrow(/invalid cause/);
  });

  it('projects:init also carries the pinned notes into CLAUDE.md', async () => {
    const { h, root } = setup();
    await h['insights:pin']({ cause: 'Timeout', fix: '加重試' });
    const dir = join(root, 'legacy'); mkdirSync(dir);
    await h['projects:init'](dir);
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8').replace(/\r\n/g, '\n'))
      .toContain('## 固定注意事項\n- Timeout → 建議：加重試');
  });

  it('pty channels are routed by path and guarded', async () => {
    const { h, root, spawnCalls, writes } = setup();
    const a = await h['projects:create']('sa'); const b = await h['projects:create']('sb');
    await h['pty:start'](a.path, { continue: false, cols: 80, rows: 24 });
    await h['pty:start'](b.path, { continue: false, cols: 80, rows: 24 });
    expect(spawnCalls.map((c) => c.cwd)).toEqual([join(root, 'sa'), join(root, 'sb')]);
    h['pty:write'](b.path, 'hi');
    expect(writes).toEqual([[join(root, 'sb'), 'hi']]);
    h['pty:write'](join(root, '..', 'x'), 'nope');   // 守衛失敗：靜默忽略
    expect(writes).toEqual([[join(root, 'sb'), 'hi']]);
    expect((await h['pty:list']()).map((s) => s.label)).toEqual(['sa', 'sb']);
    await h['pty:kill'](a.path);
    expect((await h['pty:list']()).map((s) => s.label)).toEqual(['sb']);
    await expect(h['pty:kill'](join(root, '..', 'x'))).rejects.toThrow();
    h.dispose();
  });

  it('pty:start rejects beyond the session limit', async () => {
    const { h } = setup();
    for (let i = 0; i < 4; i++) { const p = await h['projects:create'](`lim${i}`); await h['pty:start'](p.path, { continue: false, cols: 80, rows: 24 }); }
    const extra = await h['projects:create']('lim-extra');
    await expect(h['pty:start'](extra.path, { continue: false, cols: 80, rows: 24 })).rejects.toThrow(/too many sessions/);
    h.dispose();
  });

  it('pty:focus moves the background state watcher and reports state changes of background sessions', async () => {
    const onFocusChanged = vi.fn();
    const { h, send } = setup({ onFocusChanged });
    const a = await h['projects:create']('fa'); const b = await h['projects:create']('fb');
    await h['projects:open'](a.path);
    await h['pty:start'](a.path, { continue: false, cols: 80, rows: 24 });
    h['pty:focus'](a.path);
    await h['projects:open'](b.path);
    await h['pty:start'](b.path, { continue: false, cols: 80, rows: 24 });
    h['pty:focus'](b.path);
    expect(onFocusChanged).toHaveBeenLastCalledWith(b.path);
    send.mockClear();
    const s = JSON.parse(readFileSync(join(a.path, '.pm', 'state.json'), 'utf8'));
    s.stage = 'design'; s.stages.env.status = 'done'; s.stages.design.status = 'in_progress';
    await new Promise((r) => setTimeout(r, 30));
    writeFileSync(join(a.path, '.pm', 'state.json'), JSON.stringify(s));
    await vi.waitFor(() => {
      const call = send.mock.calls.find((c) => c[0] === 'project:state' && (c[1] as { path: string }).path === a.path);
      expect(call).toBeTruthy();
      expect((call![1] as { state: { stage: string } }).state.stage).toBe('design');
    }, { timeout: 3000 });
    h.dispose();
  });

  it('pty:write reports user input for the guarded session path', async () => {
    const onUserInput = vi.fn();
    const { h, root, base } = setup({ onUserInput });
    const p = await h['projects:create']('typing');
    await h['pty:start'](p.path, { continue: false, cols: 80, rows: 24 });
    h['pty:write'](p.path, 'x');
    expect(onUserInput).toHaveBeenCalledWith(join(root, 'typing'));
    h['pty:write'](join(base, 'outside'), 'y');
    expect(onUserInput).toHaveBeenCalledTimes(1);
  });
});
