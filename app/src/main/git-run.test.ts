import { describe, it, expect, beforeAll, vi } from 'vitest';
// readFileSync 被包成 spy，才能驗大檔沒有被整份讀進記憶體；其餘 fs 全部用真的
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return { ...real, default: real, readFileSync: vi.fn(real.readFileSync) };
});
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { getBranches, getDiff, getExtras, getStatus, hasHead, parseStatus, runGit, showCommit, MAX_TEXT, TRUNCATED } from './git-run';

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

describe('getDiff / showCommit', () => {
  it('returns staged and unstaged diffs, untracked previews and commit patches', async () => {
    const dir = repo();
    commit(dir, 'a.txt', 'one\n');
    writeFileSync(join(dir, 'a.txt'), 'two\n');
    git(dir, 'add', 'a.txt');
    writeFileSync(join(dir, 'a.txt'), 'three\n');
    writeFileSync(join(dir, 'n.txt'), 'hello');
    expect(await getDiff(dir, 'a.txt', 'staged')).toMatch(/-one\n\+two/);
    expect(await getDiff(dir, 'a.txt', 'unstaged')).toMatch(/-two\n\+three/);
    expect(await getDiff(dir, 'n.txt', 'unstaged')).toBe('');
    expect(await getDiff(dir, 'n.txt', 'untracked')).toBe('（新檔案）\nhello');
    expect(await getDiff(dir, 'missing.txt', 'untracked')).toBe('（無法讀取檔案）');

    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'bin'), Buffer.from([0, 1, 2]));
    expect(await getDiff(dir, 'sub/', 'untracked')).toBe('（新資料夾）');
    expect(await getDiff(dir, 'sub/bin', 'untracked')).toBe('（二進位檔案）');

    writeFileSync(join(dir, 'big.txt'), 'x'.repeat(MAX_TEXT + 10));
    const big = await getDiff(dir, 'big.txt', 'untracked');
    expect(big.endsWith(TRUNCATED)).toBe(true);
    expect(big.length).toBe(MAX_TEXT + TRUNCATED.length);

    const hash = git(dir, 'rev-parse', '--short', 'HEAD').trim();
    const shown = await showCommit(dir, hash);
    expect(shown).toMatch(/a\.txt \|/);
    expect(shown).toMatch(/\+one/);
    await expect(showCommit(dir, 'deadbeef')).rejects.toThrow();
  });

  it('caps how much of a huge untracked file is read, and refuses symlinks and .git paths', async () => {
    const dir = repo();
    const huge = 2 * 1024 * 1024;
    writeFileSync(join(dir, 'huge.txt'), 'y'.repeat(huge));
    vi.mocked(readFileSync).mockClear();
    const out = await getDiff(dir, 'huge.txt', 'untracked');
    expect(out.endsWith(TRUNCATED)).toBe(true);
    // 只讀了開頭約 512 KB：結果長度與檔案大小無關，而且沒有整份 readFileSync
    expect(out.length).toBe(MAX_TEXT + TRUNCATED.length);
    expect(vi.mocked(readFileSync)).not.toHaveBeenCalled();

    expect(await getDiff(dir, '.git/config', 'untracked')).toBe('（無法讀取檔案）');
    expect(await getDiff(dir, '.git\\config', 'untracked')).toBe('（無法讀取檔案）');

    // Windows 沒有開發者模式時無法建立 symlink，建得起來才驗
    let linked = false;
    try { symlinkSync(join(dir, 'huge.txt'), join(dir, 'link.txt')); linked = true; } catch { linked = false; }
    if (linked) expect(await getDiff(dir, 'link.txt', 'untracked')).toBe('（無法讀取檔案）');
  });
});

describe('getExtras', () => {
  it('lists stashes newest first (index 0) and tags, empty for a non-repo or a fresh repo', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'pm-gitrun-'));
    expect(await getExtras(plain)).toEqual({ stashes: [], tags: [] });
    const dir = repo();
    commit(dir, 'a.txt', 'one');
    expect(await getExtras(dir)).toEqual({ stashes: [], tags: [] });
    writeFileSync(join(dir, 'a.txt'), 'two');
    git(dir, 'stash', 'push', '-u', '-m', 'first');
    writeFileSync(join(dir, 'a.txt'), 'three');
    git(dir, 'stash', 'push', '-u', '-m', 'second');
    git(dir, 'tag', 'v1');
    const ex = await getExtras(dir);
    expect(ex.stashes).toEqual([{ index: 0, message: 'On main: second' }, { index: 1, message: 'On main: first' }]);
    expect(ex.tags).toEqual(['v1']);
  });
});
