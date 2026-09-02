import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { listProjects, readProjectInfo, createProject, initExisting, rebuildState, NAME_RE } from './projects';

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
});
