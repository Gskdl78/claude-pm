import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHandlers } from './ipc-handlers';
import { PtyManager, type SpawnFn } from './pty';

const PLUGIN_DIR = resolve(__dirname, '../../../plugin');

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'pm-test', GIT_AUTHOR_EMAIL: 'pm-test@local',
    GIT_COMMITTER_NAME: 'pm-test', GIT_COMMITTER_EMAIL: 'pm-test@local',
  });
});

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'pm-ipc-'));
  const root = join(base, 'root');
  mkdirSync(root);
  const configFile = join(base, 'config.json');
  writeFileSync(configFile, JSON.stringify({ root, lastProject: null, recent: [] }));
  const spawnCalls: Array<{ file: string; args: string[]; cwd: string }> = [];
  const spawn: SpawnFn = (file, args, opts) => {
    spawnCalls.push({ file, args, cwd: opts.cwd });
    return { onData() {}, onExit() {}, write() {}, resize() {}, kill() {} };
  };
  const pty = new PtyManager(spawn);
  const send = vi.fn();
  const openPath = vi.fn(async () => '');
  const h = createHandlers({ pluginDir: PLUGIN_DIR, configFile, pty, send, openPath, checkClaude: async () => ({ ok: true, path: 'x' }) });
  return { base, root, configFile, h, send, spawnCalls, openPath };
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
});
