import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeTempDir, gitEnv } from './helpers.mjs';
import {
  NAME_RE, validateName, isInitialized, renderTemplate, scaffoldProject,
} from '../scripts/scaffold.mjs';

const PLUGIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'pm-test', GIT_AUTHOR_EMAIL: 'pm-test@local',
    GIT_COMMITTER_NAME: 'pm-test', GIT_COMMITTER_EMAIL: 'pm-test@local',
  });
});

function gitLog(cwd) {
  const r = spawnSync('git', ['log', '--format=%s'], { cwd, encoding: 'utf8', env: gitEnv() });
  return r.stdout.trim().split('\n');
}

describe('validateName', () => {
  it('accepts simple names and rejects bad ones', () => {
    expect(() => validateName('my-app')).not.toThrow();
    expect(() => validateName('App_2.0')).not.toThrow();
    for (const bad of ['', '.hidden', 'has space', 'a/b', 'a\\b', 'x'.repeat(65), 'CON?']) {
      expect(() => validateName(bad), bad).toThrow(/invalid project name/);
    }
    expect(NAME_RE.test('ok')).toBe(true);
  });
});

describe('renderTemplate', () => {
  it('replaces {{vars}} and blanks unknown ones', () => {
    expect(renderTemplate('# {{name}} ({{type}}) {{missing}}', { name: 'a', type: 'web' })).toBe('# a (web) ');
  });
});

describe('scaffoldProject', () => {
  it('seeds skills, scripts, state, CLAUDE.md, gitignore and an initial commit', () => {
    const root = makeTempDir();
    const target = join(root, 'demo');
    const r = scaffoldProject({ targetDir: target, pluginDir: PLUGIN_DIR });
    expect(r).toEqual({ targetDir: target, name: 'demo' });

    for (const rel of [
      '.claude/skills/stage-env/SKILL.md',
      '.claude/skills/stage-design/SKILL.md',
      '.claude/skills/stage-tech/SKILL.md',
      '.claude/skills/stage-build/SKILL.md',
      '.claude/skills/stage-verify/SKILL.md',
      '.claude/skills/pm-status/SKILL.md',
      '.pm/pm-state.mjs', '.pm/pm-state-lib.mjs', '.pm/state.json', 'CLAUDE.md', '.gitignore',
    ]) expect(existsSync(join(target, rel)), rel).toBe(true);

    const claude = readFileSync(join(target, 'CLAUDE.md'), 'utf8');
    expect(claude).toMatch(/^# demo/);
    expect(claude).toContain('專案類型：other');
    expect(claude).toContain('（尚無歷史注意事項）');
    expect(isInitialized(target)).toBe(true);
    expect(JSON.parse(readFileSync(join(target, '.pm/state.json'), 'utf8')).name).toBe('demo');
    expect(gitLog(target)).toEqual(['chore: init project']);
  });

  it('refuses to scaffold twice and validates the name', () => {
    const root = makeTempDir();
    const target = join(root, 'twice');
    scaffoldProject({ targetDir: target, pluginDir: PLUGIN_DIR, git: false });
    expect(() => scaffoldProject({ targetDir: target, pluginDir: PLUGIN_DIR, git: false })).toThrow(/already initialized/);
    expect(() => scaffoldProject({ targetDir: join(root, 'bad name'), pluginDir: PLUGIN_DIR, git: false })).toThrow(/invalid project name/);
  });

  it('keeps an existing CLAUDE.md and .git', () => {
    const root = makeTempDir();
    const target = join(root, 'existing');
    mkdirSync(target);
    writeFileSync(join(target, 'CLAUDE.md'), '# keep me');
    spawnSync('git', ['init', '-b', 'main'], { cwd: target, env: gitEnv() });
    writeFileSync(join(target, 'a.txt'), 'a');
    spawnSync('git', ['add', '-A'], { cwd: target, env: gitEnv() });
    spawnSync('git', ['commit', '-q', '-m', 'first'], { cwd: target, env: gitEnv() });

    scaffoldProject({ targetDir: target, pluginDir: PLUGIN_DIR });
    expect(readFileSync(join(target, 'CLAUDE.md'), 'utf8')).toBe('# keep me');
    expect(gitLog(target)).toEqual(['chore: init project', 'first']);
  });

  it('CLI prints JSON', () => {
    const root = makeTempDir();
    const target = join(root, 'cli');
    const r = spawnSync(process.execPath, [join(PLUGIN_DIR, 'scripts', 'scaffold.mjs'), target, 'cli', '--no-git'], { encoding: 'utf8', env: gitEnv() });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ targetDir: target, name: 'cli' });
  });
});
