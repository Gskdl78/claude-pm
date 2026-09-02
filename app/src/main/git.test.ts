import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { getLog } from './git';

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 'pm-test', GIT_AUTHOR_EMAIL: 'pm-test@local',
  GIT_COMMITTER_NAME: 'pm-test', GIT_COMMITTER_EMAIL: 'pm-test@local',
};
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env, stdio: 'pipe' });

describe('getLog', () => {
  it('returns [] for a non-repo and an empty repo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-git-'));
    expect(await getLog(dir)).toEqual([]);
    git(dir, 'init', '-b', 'main');
    expect(await getLog(dir)).toEqual([]);
  });

  it('returns newest-first short hashes and subjects, limited to n', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-git-'));
    git(dir, 'init', '-b', 'main');
    for (const m of ['chore: init project', 'chore(env): done', 'docs(design): done']) {
      writeFileSync(join(dir, `${m.length}.txt`), m);
      git(dir, 'add', '-A');
      git(dir, 'commit', '-q', '-m', m);
    }
    const log = await getLog(dir, 2);
    expect(log).toHaveLength(2);
    expect(log[0].message).toBe('docs(design): done');
    expect(log[0].hash).toMatch(/^[0-9a-f]{7}$/);
    expect(new Date(log[0].date).getFullYear()).toBeGreaterThan(2000);
  });
});
