import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSkillHandlers } from './skill-handlers';
import { globalSkillsDir, projectSkillsDir } from './skill-install';

const tmp = () => mkdtempSync(join(tmpdir(), 'pm-skill-h-'));
const pass = (p: string) => p;

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'pm-test', GIT_AUTHOR_EMAIL: 'pm-test@local',
    GIT_COMMITTER_NAME: 'pm-test', GIT_COMMITTER_EMAIL: 'pm-test@local',
  });
});

function project(): string {
  const dir = tmp();
  writeFileSync(join(dir, 'README.md'), '# p\n');
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

function source(): string {
  const dir = join(tmp(), 'foo');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: foo\ndescription: d\n---\n\nbody\n');
  return dir;
}

describe('skill handlers', () => {
  it('fetch scans the source and reports no collision on a clean project', async () => {
    const h = createSkillHandlers(pass, tmp());
    const r = await h['skills:fetch'](source(), project());
    expect(r.reports).toHaveLength(1);
    expect(r.reports[0]!.name).toBe('foo');
    expect(r.reports[0]!.collisions).toEqual([]);
    expect(r.cacheId).toMatch(/^[0-9a-f]{16}$/);
  });

  it('fetch marks a name the project already has', async () => {
    const h = createSkillHandlers(pass, tmp());
    const p = project();
    const src = source();
    const { cacheId } = await h['skills:fetch'](src, p);
    await h['skills:install'](cacheId, 'foo', p, null);
    const again = await h['skills:fetch'](src, p);
    expect(again.reports[0]!.collisions.map((c) => c.scope)).toContain('project');
  });

  it('install then adopt then promote walks the three states', async () => {
    const home = tmp();
    const h = createSkillHandlers(pass, home);
    const p = project();
    const { cacheId } = await h['skills:fetch'](source(), p);

    const afterInstall = await h['skills:install'](cacheId, 'foo', p, null);
    expect(afterInstall.find((s) => s.name === 'foo')?.status).toBe('trial');

    const afterAdopt = await h['skills:adopt'](p, 'foo');
    expect(afterAdopt.result?.ok).toBe(true);
    expect(afterAdopt.installs.find((s) => s.name === 'foo')?.status).toBe('adopted');

    const afterPromote = await h['skills:promote'](p, 'foo');
    expect(afterPromote.installs.find((s) => s.name === 'foo')?.status).toBe('global');
    expect(existsSync(join(projectSkillsDir(p), 'foo'))).toBe(false);
    expect(existsSync(join(globalSkillsDir(home), 'foo', 'SKILL.md'))).toBe(true);
  });

  it('rejects an unknown cacheId, a bad name and a bad scope', async () => {
    const h = createSkillHandlers(pass, tmp());
    const p = project();
    await expect(h['skills:install']('0'.repeat(16), 'foo', p, null)).rejects.toThrow(/unknown source/);
    const { cacheId } = await h['skills:fetch'](source(), p);
    await expect(h['skills:install'](cacheId, '../evil', p, null)).rejects.toThrow(/invalid skill name/);
    await expect(h['skills:remove'](p, 'foo', 'everywhere' as never)).rejects.toThrow(/invalid scope/);
  });

  it('runs every project path through the root guard', async () => {
    const seen: string[] = [];
    const h = createSkillHandlers((p) => { seen.push(p); return p; }, tmp());
    const p = project();
    await h['skills:list'](p);
    expect(seen).toEqual([p]);
  });
});
