import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHandlers, type HandlerDeps } from './ipc-handlers';
import { PtyManager, type SpawnFn } from './pty';

const PLUGIN_DIR = resolve(__dirname, '../../../plugin');

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'pm-test', GIT_AUTHOR_EMAIL: 'pm-test@local',
    GIT_COMMITTER_NAME: 'pm-test', GIT_COMMITTER_EMAIL: 'pm-test@local',
  });
});

function setup(extra: Partial<Pick<HandlerDeps, 'onSessionStart' | 'onSessionEnd' | 'pty' | 'openExternal'>> = {}) {
  const base = mkdtempSync(join(tmpdir(), 'pm-ipc-'));
  const root = join(base, 'root');
  mkdirSync(root);
  const configFile = join(base, 'config.json');
  writeFileSync(configFile, JSON.stringify({ root, lastProject: null, recent: [] }));
  const spawnCalls: Array<{ file: string; args: string[]; cwd: string; cols: number; rows: number }> = [];
  const writes: unknown[] = [];
  const resizes: Array<[unknown, unknown]> = [];
  const spawn: SpawnFn = (file, args, opts) => {
    spawnCalls.push({ file, args, cwd: opts.cwd, cols: opts.cols, rows: opts.rows });
    return {
      onData() {}, onExit() {}, kill() {},
      write(d) { writes.push(d); },
      resize(c, r) { resizes.push([c, r]); },
    };
  };
  const pty = new PtyManager(spawn);
  const send = vi.fn();
  const openPath = vi.fn(async () => '');
  const h = createHandlers({ pluginDir: PLUGIN_DIR, configFile, pty, send, openPath, checkClaude: async () => ({ ok: true, path: 'x' }), ...extra });
  return { base, root, configFile, h, send, spawnCalls, openPath, writes, resizes };
}

describe('ipc handlers', () => {
  it('config get/setRoot', async () => {
    const { h, root, base } = setup();
    expect((await h['config:get']()).root).toBe(root);
    await expect(h['config:setRoot'](join(base, 'missing'))).rejects.toThrow(/root not found/);
    const other = join(base, 'other'); mkdirSync(other);
    expect((await h['config:setRoot'](other)).root).toBe(other);
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

    h['pty:write']('ok');
    h['pty:write'](123 as unknown as string);
    h['pty:write'](undefined as unknown as string);
    expect(writes).toEqual(['ok']);

    h['pty:resize'](10, 20);
    h['pty:resize'](Number.POSITIVE_INFINITY, 20);
    h['pty:resize'](10, Number.NaN);
    h['pty:resize']('10' as unknown as number, 20);
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
    const { h } = setup({ onSessionStart, onSessionEnd, pty: new PtyManager(throwing) });
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
    await h['pty:kill']();
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
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
});
