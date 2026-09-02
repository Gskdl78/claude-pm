import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { getBranches, getStatus, hasHead, parseStatus, runGit } from './git-run';

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'pm-test', GIT_AUTHOR_EMAIL: 'pm-test@local',
    GIT_COMMITTER_NAME: 'pm-test', GIT_COMMITTER_EMAIL: 'pm-test@local',
  });
});

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pm-gitrun-'));
  git(dir, 'init', '-b', 'main');
  return dir;
}

function commit(dir: string, name: string, msg: string): void {
  writeFileSync(join(dir, name), msg);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', msg);
}

describe('parseStatus', () => {
  it('parses header, renames, conflicts and untracked entries from -z output', () => {
    const raw = ['## main...origin/main [ahead 2, behind 1]', 'M  a.txt', ' M b.txt', 'MM c.txt', 'R  new.txt', 'old.txt', '?? d.txt', 'UU e.txt', ''].join('\0');
    const s = parseStatus(raw);
    expect(s).toMatchObject({ branch: 'main', upstream: 'origin/main', ahead: 2, behind: 1, detached: false, noCommits: false });
    expect(s.files.map((f) => f.path)).toEqual(['a.txt', 'b.txt', 'c.txt', 'new.txt', 'd.txt', 'e.txt']);
    expect(s.files[0]).toMatchObject({ staged: true, unstaged: false, untracked: false, conflicted: false });
    expect(s.files[1]).toMatchObject({ staged: false, unstaged: true });
    expect(s.files[2]).toMatchObject({ staged: true, unstaged: true });
    expect(s.files[3]).toMatchObject({ origPath: 'old.txt', staged: true });
    expect(s.files[4]).toMatchObject({ untracked: true, staged: false, unstaged: false });
    expect(s.files[5]).toMatchObject({ conflicted: true, staged: false, unstaged: false });
  });

  it('recognises an unborn branch, a detached HEAD and a branch without upstream', () => {
    expect(parseStatus('## No commits yet on main\0')).toMatchObject({ branch: 'main', noCommits: true, upstream: null });
    expect(parseStatus('## HEAD (no branch)\0')).toMatchObject({ branch: 'HEAD', detached: true });
    expect(parseStatus('## dev\0')).toMatchObject({ branch: 'dev', upstream: null, ahead: 0, behind: 0, files: [] });
  });
});

describe('runGit / getStatus / getBranches', () => {
  it('reports a non-repo, then an empty repo without remote or HEAD', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-gitrun-'));
    expect((await getStatus(dir)).isRepo).toBe(false);
    git(dir, 'init', '-b', 'main');
    const s = await getStatus(dir);
    expect(s).toMatchObject({ isRepo: true, branch: 'main', noCommits: true, hasRemote: false, merging: false, files: [] });
    expect(await hasHead(dir)).toBe(false);
    expect(await getBranches(dir)).toEqual({ current: '', all: [] });
  });

  it('captures exit code, stdout and stderr, and formats the command', async () => {
    const dir = repo();
    const ok = await runGit(dir, ['rev-parse', '--is-inside-work-tree']);
    expect(ok).toMatchObject({ ok: true, code: 0, command: 'git rev-parse --is-inside-work-tree' });
    expect(ok.stdout.trim()).toBe('true');
    const bad = await runGit(dir, ['switch', 'nope']);
    expect(bad.ok).toBe(false);
    expect(bad.code).not.toBe(0);
    expect(bad.stderr).toMatch(/invalid reference/);
  });

  it('lists staged, unstaged and untracked files with ahead count, remote and branches', async () => {
    const dir = repo();
    commit(dir, 'a.txt', 'one');
    const bare = mkdtempSync(join(tmpdir(), 'pm-bare-'));
    git(bare, 'init', '--bare', '-b', 'main');
    git(dir, 'remote', 'add', 'origin', bare);
    git(dir, 'push', '-q', '-u', 'origin', 'main');
    commit(dir, 'c.txt', 'second');
    writeFileSync(join(dir, 'a.txt'), 'two');
    git(dir, 'add', 'a.txt');
    writeFileSync(join(dir, 'a.txt'), 'three');
    writeFileSync(join(dir, 'b.txt'), 'new');

    const s = await getStatus(dir);
    expect(s).toMatchObject({ branch: 'main', upstream: 'origin/main', ahead: 1, behind: 0, hasRemote: true, noCommits: false });
    const byPath = Object.fromEntries(s.files.map((f) => [f.path, f]));
    expect(byPath['a.txt']).toMatchObject({ staged: true, unstaged: true });
    expect(byPath['b.txt']).toMatchObject({ untracked: true });
    expect(await hasHead(dir)).toBe(true);

    git(dir, 'branch', 'dev');
    expect(await getBranches(dir)).toEqual({ current: 'main', all: ['dev', 'main'] });
  });

  it('flags a merge in progress with conflicted files', async () => {
    const dir = repo();
    commit(dir, 'a.txt', 'base');
    git(dir, 'switch', '-c', 'dev');
    commit(dir, 'a.txt', 'dev side');
    git(dir, 'switch', 'main');
    commit(dir, 'a.txt', 'main side');
    const r = await runGit(dir, ['merge', '--no-edit', 'dev']);
    expect(r.ok).toBe(false);
    expect(`${r.stdout}\n${r.stderr}`).toMatch(/CONFLICT/);
    const s = await getStatus(dir);
    expect(s.merging).toBe(true);
    expect(s.files[0]).toMatchObject({ path: 'a.txt', conflicted: true });
  });
});
