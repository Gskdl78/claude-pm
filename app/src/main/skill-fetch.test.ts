import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cacheIdFor, cacheRootFor, fetchSkillSource, skillCacheRoot } from './skill-fetch';
import { scanSkills } from './skill-scan';

const tmp = () => mkdtempSync(join(tmpdir(), 'pm-skill-fetch-'));

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'pm-test', GIT_AUTHOR_EMAIL: 'pm-test@local',
    GIT_COMMITTER_NAME: 'pm-test', GIT_COMMITTER_EMAIL: 'pm-test@local',
  });
});

describe('cacheIdFor', () => {
  it('is stable per source and different across sources', () => {
    expect(cacheIdFor('https://github.com/u/r')).toBe(cacheIdFor('https://github.com/u/r'));
    expect(cacheIdFor('https://github.com/u/r')).not.toBe(cacheIdFor('https://github.com/u/other'));
    expect(cacheIdFor('https://github.com/u/r')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('fetchSkillSource', () => {
  it('uses a local path as the scan root without cloning', async () => {
    const home = tmp();
    const dir = join(tmp(), 'foo');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), '---\nname: foo\n---\n');
    const r = await fetchSkillSource(dir, home);
    expect(r.root).toBe(dir);
    expect(cacheRootFor(r.cacheId)).toBe(dir);
    expect(existsSync(skillCacheRoot(home))).toBe(false);
  });

  it('clones a repo url into the cache and finds the skill inside it', async () => {
    const home = tmp();
    const work = join(tmp(), 'src');
    mkdirSync(join(work, 'skills', 'foo'), { recursive: true });
    writeFileSync(join(work, 'skills', 'foo', 'SKILL.md'), '---\nname: foo\ndescription: d\n---\n');
    execFileSync('git', ['init', '-q'], { cwd: work });
    execFileSync('git', ['add', '-A'], { cwd: work });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: work });

    // 本機路徑走 local 分支（不 clone），掃到的仍是 repo 裡那個 skill
    const r = await fetchSkillSource(work, home);
    expect(r.root).toBe(work);
    expect(scanSkills(r.root).map((s) => s.name)).toEqual(['foo']);
  });

  it('rejects a source that does not parse', async () => {
    await expect(fetchSkillSource('javascript:alert(1)', tmp())).rejects.toThrow(/invalid skill source/);
  });

  it('rejects a local path that does not exist', async () => {
    await expect(fetchSkillSource(join(tmp(), 'nope'), tmp())).rejects.toThrow(/invalid skill source/);
  });

  it('does not hand out a root for an unknown cache id', () => {
    expect(cacheRootFor('0'.repeat(16))).toBeNull();
  });
});
