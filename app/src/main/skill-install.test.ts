import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { hasExclude } from './skill-exclude';
import {
  adoptSkill, assertSkillName, findCollisions, globalSkillsDir, installTrial,
  listInstalled, projectSkillsDir, promoteSkill, removeSkill,
} from './skill-install';

const tmp = () => mkdtempSync(join(tmpdir(), 'pm-skill-inst-'));

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'pm-test', GIT_AUTHOR_EMAIL: 'pm-test@local',
    GIT_COMMITTER_NAME: 'pm-test', GIT_COMMITTER_EMAIL: 'pm-test@local',
  });
});

/** 一個已 init 且有第一個 commit 的專案。 */
function project(): string {
  const dir = tmp();
  writeFileSync(join(dir, 'README.md'), '# p\n');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

function source(name = 'foo'): string {
  const dir = join(tmp(), name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\n\nbody\n`);
  return dir;
}

const status = (dir: string, name: string, home?: string) =>
  listInstalled(dir, home).find((s) => s.name === name)?.status ?? 'none';

describe('assertSkillName', () => {
  it('rejects names that could escape the skills folder', () => {
    expect(assertSkillName('good-name_1')).toBe('good-name_1');
    for (const bad of ['..', '../x', 'a/b', 'a\\b', '-lead', '', 'x'.repeat(65)]) {
      expect(() => assertSkillName(bad), bad).toThrow(/invalid skill name/);
    }
  });
});

describe('installTrial', () => {
  it('copies the skill in and hides it via exclude', () => {
    const p = project();
    installTrial(source(), p, 'foo');
    expect(existsSync(join(projectSkillsDir(p), 'foo', 'SKILL.md'))).toBe(true);
    expect(hasExclude(p, 'foo')).toBe(true);
    expect(status(p, 'foo')).toBe('trial');
    const out = execFileSync('git', ['status', '--porcelain'], { cwd: p, encoding: 'utf8' });
    expect(out).not.toContain('foo');
  });

  it('renames the folder and the frontmatter name together', () => {
    const p = project();
    installTrial(source(), p, 'foo', 'foo2');
    expect(existsSync(join(projectSkillsDir(p), 'foo'))).toBe(false);
    expect(readFileSync(join(projectSkillsDir(p), 'foo2', 'SKILL.md'), 'utf8')).toContain('name: foo2');
    expect(status(p, 'foo2')).toBe('trial');
  });

  it('refuses to overwrite an existing skill of the same name', () => {
    const p = project();
    installTrial(source(), p, 'foo');
    expect(() => installTrial(source(), p, 'foo')).toThrow(/skill name exists/);
  });
});

describe('adopt / promote / remove', () => {
  it('adopt drops the exclude line and commits', async () => {
    const p = project();
    installTrial(source(), p, 'foo');
    const r = await adoptSkill(p, 'foo');
    expect(r.ok).toBe(true);
    expect(hasExclude(p, 'foo')).toBe(false);
    expect(status(p, 'foo')).toBe('adopted');
    const log = execFileSync('git', ['log', '-1', '--format=%s'], { cwd: p, encoding: 'utf8' });
    expect(log).toContain('chore(skills): 採用 foo');
  });

  it('promote moves the folder to the global dir', async () => {
    const home = tmp();
    const p = project();
    installTrial(source(), p, 'foo');
    await promoteSkill(p, 'foo', home);
    expect(existsSync(join(projectSkillsDir(p), 'foo'))).toBe(false);
    expect(existsSync(join(globalSkillsDir(home), 'foo', 'SKILL.md'))).toBe(true);
    expect(status(p, 'foo', home)).toBe('global');
  });

  it('promote of an adopted skill removes it from git too', async () => {
    const home = tmp();
    const p = project();
    installTrial(source(), p, 'foo');
    await adoptSkill(p, 'foo');
    const r = await promoteSkill(p, 'foo', home);
    expect(r?.ok).toBe(true);
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: p, encoding: 'utf8' }).trim()).toBe('');
    expect(status(p, 'foo', home)).toBe('global');
  });

  it('remove deletes the trial copy and its exclude line', () => {
    const p = project();
    installTrial(source(), p, 'foo');
    removeSkill(p, 'foo', 'project');
    expect(existsSync(join(projectSkillsDir(p), 'foo'))).toBe(false);
    expect(hasExclude(p, 'foo')).toBe(false);
    expect(status(p, 'foo')).toBe('none');
  });
});

describe('findCollisions', () => {
  it('reports the project and global copies separately', () => {
    const home = tmp();
    const p = project();
    expect(findCollisions('foo', p, home)).toEqual([]);
    installTrial(source(), p, 'foo');
    expect(findCollisions('foo', p, home).map((c) => c.scope)).toEqual(['project']);
    mkdirSync(join(globalSkillsDir(home), 'foo'), { recursive: true });
    expect(findCollisions('foo', p, home).map((c) => c.scope)).toEqual(['project', 'global']);
  });

  it('skips the project scope when there is no project open', () => {
    const home = tmp();
    mkdirSync(join(globalSkillsDir(home), 'foo'), { recursive: true });
    expect(findCollisions('foo', null, home).map((c) => c.scope)).toEqual(['global']);
  });
});
