import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { listProjects, readProjectInfo, createProject, initExisting, rebuildState, scaffoldArgs, cloneProject, assertCloneSource, NAME_RE } from './projects';

const PLUGIN_DIR = resolve(__dirname, '../../../plugin');
const tmp = () => mkdtempSync(join(tmpdir(), 'pm-proj-'));

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'pm-test', GIT_AUTHOR_EMAIL: 'pm-test@local',
    GIT_COMMITTER_NAME: 'pm-test', GIT_COMMITTER_EMAIL: 'pm-test@local',
  });
});

describe('listProjects / readProjectInfo', () => {
  it('lists directories with initialized flag and parsed state', () => {
    const root = tmp();
    mkdirSync(join(root, 'b'));
    mkdirSync(join(root, 'a', '.pm'), { recursive: true });
    writeFileSync(join(root, 'a', '.pm', 'state.json'), JSON.stringify({
      version: 1, name: 'a', type: 'web', stage: 'design',
      stages: { env: { status: 'done' }, design: { status: 'in_progress' }, tech: { status: 'pending' }, build: { status: 'pending' }, verify: { status: 'pending' } },
      issues: [],
    }));
    mkdirSync(join(root, '.hidden'));
    writeFileSync(join(root, 'file.txt'), 'x');

    const list = listProjects(root);
    expect(list.map((p) => p.name)).toEqual(['a', 'b']);
    expect(list[0]).toMatchObject({ initialized: true, path: join(root, 'a') });
    expect(list[0].state?.stage).toBe('design');
    expect(list[1]).toMatchObject({ initialized: false, state: null });
  });

  it('reports corrupt state via stateError', () => {
    const root = tmp();
    mkdirSync(join(root, 'c', '.pm'), { recursive: true });
    writeFileSync(join(root, 'c', '.pm', 'state.json'), '{bad');
    const info = readProjectInfo(join(root, 'c'));
    expect(info.initialized).toBe(true);
    expect(info.state).toBeNull();
    expect(info.stateError).toMatch(/JSON/);
  });

  it('returns [] for a missing root', () => {
    expect(listProjects(join(tmp(), 'nope'))).toEqual([]);
  });
});

describe('createProject / initExisting / rebuildState', () => {
  it('creates and scaffolds a project via the plugin', async () => {
    const root = tmp();
    const info = await createProject(root, 'demo', PLUGIN_DIR);
    expect(info).toMatchObject({ name: 'demo', path: join(root, 'demo'), initialized: true });
    expect(info.state?.stage).toBe('env');
    expect(existsSync(join(root, 'demo', '.claude', 'skills', 'stage-env', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(root, 'demo', '.git'))).toBe(true);
  });

  it('rejects invalid names and existing folders', async () => {
    const root = tmp();
    await expect(createProject(root, 'bad name', PLUGIN_DIR)).rejects.toThrow(/invalid project name/);
    mkdirSync(join(root, 'taken'));
    await expect(createProject(root, 'taken', PLUGIN_DIR)).rejects.toThrow(/already exists/);
    expect(NAME_RE.test('ok-1')).toBe(true);
  });

  it('initExisting scaffolds an existing folder once', async () => {
    const root = tmp();
    mkdirSync(join(root, 'old'));
    writeFileSync(join(root, 'old', 'README.md'), '# old');
    const info = await initExisting(join(root, 'old'), PLUGIN_DIR);
    expect(info.initialized).toBe(true);
    await expect(initExisting(join(root, 'old'), PLUGIN_DIR)).rejects.toThrow(/already initialized/);
  });

  it('rebuildState repairs a corrupt state file', async () => {
    const root = tmp();
    await createProject(root, 'fix', PLUGIN_DIR);
    writeFileSync(join(root, 'fix', '.pm', 'state.json'), 'garbage');
    const info = await rebuildState(join(root, 'fix'), PLUGIN_DIR);
    expect(info.state?.stage).toBe('env');
    expect(info.stateError).toBeUndefined();
  });

  it('passes model vars to scaffold so CLAUDE.md reflects them', async () => {
    const root = tmp();
    await createProject(root, 'policy', PLUGIN_DIR, { implModel: 'sonnet', reviewModel: 'opus', maxRetries: 5 });
    const claude = readFileSync(join(root, 'policy', 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('實作 subagent：`sonnet`');
    expect(claude).toContain('審核退回上限 5 次');
    expect(scaffoldArgs({ implModel: 'a', reviewModel: 'b', maxRetries: 2 })).toEqual(['--impl-model=a', '--review-model=b', '--max-retries=2']);
    expect(scaffoldArgs({ implModel: 'a', reviewModel: 'b', maxRetries: 2, pinnedFile: 'C:\\p.md' })).toEqual(['--impl-model=a', '--review-model=b', '--max-retries=2', '--pinned-file=C:\\p.md']);
    expect(scaffoldArgs()).toEqual([]);
  });
});

describe('cloneProject / assertCloneSource', () => {
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();
  function bareWithCommit(): string {
    const work = tmp();
    git(work, 'init', '-b', 'main');
    writeFileSync(join(work, 'README.md'), '# src');
    git(work, 'add', '-A');
    git(work, 'commit', '-q', '-m', 'init');
    const bare = mkdtempSync(join(tmpdir(), 'pm-bare-'));
    git(bare, 'init', '--bare', '-b', 'main');
    git(work, 'push', '-q', bare, 'main');
    return bare;
  }

  it('clones a local repository into root/<name> without initialising pm', async () => {
    const root = tmp();
    const info = await cloneProject(root, bareWithCommit(), 'cloned');
    expect(info).toMatchObject({ name: 'cloned', path: join(root, 'cloned'), initialized: false, state: null });
    expect(existsSync(join(root, 'cloned', '.git'))).toBe(true);
    expect(existsSync(join(root, 'cloned', 'README.md'))).toBe(true);
    expect(existsSync(join(root, 'cloned', '.pm'))).toBe(false);
  });

  it('rejects an existing folder, a bad name and an unreachable source', async () => {
    const root = tmp();
    const bare = bareWithCommit();
    mkdirSync(join(root, 'taken'));
    await expect(cloneProject(root, bare, 'taken')).rejects.toThrow(/folder already exists/);
    await expect(cloneProject(root, bare, 'bad name')).rejects.toThrow(/invalid project name/);
    await expect(cloneProject(root, join(root, 'nope'), 'x')).rejects.toThrow();
    expect(existsSync(join(root, 'x'))).toBe(false);
  });

  it('assertCloneSource accepts remote urls and existing absolute directories only', () => {
    const dir = tmp();
    expect(assertCloneSource('https://github.com/o/r.git')).toBe('https://github.com/o/r.git');
    expect(assertCloneSource('git@github.com:o/r.git')).toBe('git@github.com:o/r.git');
    expect(assertCloneSource(dir)).toBe(dir);
    for (const bad of ['', 'javascript:alert(1)', 'relative/path', join(dir, 'missing'), 'ext::sh -c calc', 'file:///C:/x', 42, null]) {
      expect(() => assertCloneSource(bad)).toThrow(/invalid clone source/);
    }
  });

  it('assertCloneSource rejects UNC and device paths before touching the filesystem', () => {
    // statSync 到連不上的 UNC 主機會整個主程序卡住（沒有 timeout 可設），所以先用字串形狀擋掉
    for (const bad of ['\\\\server\\share\\repo', '\\\\?\\C:\\x', '\\\\.\\pipe\\x', '//server/share/repo']) {
      expect(() => assertCloneSource(bad)).toThrow(/invalid clone source/);
    }
  });
});
