import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createGitHandlers } from './git-handlers';
import { assertInsideRoot } from './paths';

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'pm-test', GIT_AUTHOR_EMAIL: 'pm-test@local',
    GIT_COMMITTER_NAME: 'pm-test', GIT_COMMITTER_EMAIL: 'pm-test@local',
  });
});

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'pm-gith-'));
  const root = join(base, 'root'); mkdirSync(root);
  const dir = join(root, 'proj'); mkdirSync(dir);
  const h = createGitHandlers((p) => assertInsideRoot(root, p));
  return { base, root, dir, h };
}

describe('git handlers', () => {
  it('guards every path-taking channel', async () => {
    const { base, h } = setup();
    const outside = join(base, 'outside'); mkdirSync(outside);
    await expect(h['git:status'](outside)).rejects.toThrow(/path outside root/);
    await expect(h['git:branches'](outside)).rejects.toThrow(/path outside root/);
    await expect(h['git:diff'](outside, 'a.txt', 'unstaged')).rejects.toThrow(/path outside root/);
    await expect(h['git:show'](outside, 'abcdef0')).rejects.toThrow(/path outside root/);
    await expect(h['git:run'](outside, { kind: 'fetch' })).rejects.toThrow(/path outside root/);
    await expect(h['git:extras'](outside)).rejects.toThrow(/path outside root/);
    await expect(h['gh:check'](outside)).rejects.toThrow(/path outside root/);
    await expect(h['gh:repoCreate'](outside, 'x', true)).rejects.toThrow(/path outside root/);
  });

  it('rejects malformed file paths, hashes, modes and actions before touching git', async () => {
    const { dir, h } = setup();
    await expect(h['git:diff'](dir, '../x', 'unstaged')).rejects.toThrow(/invalid path/);
    await expect(h['git:diff'](dir, 'C:\\x', 'unstaged')).rejects.toThrow(/invalid path/);
    await expect(h['git:diff'](dir, 'a.txt', 'weird' as never)).rejects.toThrow(/invalid diff mode/);
    await expect(h['git:show'](dir, '--output=x')).rejects.toThrow(/invalid hash/);
    await expect(h['git:run'](dir, { kind: 'stage', file: '/etc/passwd' })).rejects.toThrow(/invalid path/);
    await expect(h['git:run'](dir, { kind: 'switch', branch: '--force' })).rejects.toThrow(/invalid branch/);
    await expect(h['git:run'](dir, { kind: 'commit', message: '   ', amend: false })).rejects.toThrow(/invalid message/);
    await expect(h['git:run'](dir, { kind: 'rebase' } as never)).rejects.toThrow(/invalid action/);
    await expect(h['git:run'](dir, { kind: 'reset', mode: 'hard', target: 'main' })).rejects.toThrow(/invalid reset target/);
    await expect(h['git:run'](dir, { kind: 'stashPop', index: -1 })).rejects.toThrow(/invalid stash index/);
    await expect(h['git:run'](dir, { kind: 'addRemote', url: 'ext::sh -c calc' })).rejects.toThrow(/invalid remote url/);
    await expect(h['gh:repoCreate'](dir, '-x', true)).rejects.toThrow(/invalid repo name/);
    expect(existsSync(join(dir, '.git'))).toBe(false);
  });

  it('init → stage → unstage without HEAD → commit → discard → branch → merge', async () => {
    const { dir, h } = setup();
    expect((await h['git:status'](dir)).isRepo).toBe(false);
    expect(await h['git:run'](dir, { kind: 'init' })).toMatchObject({ ok: true, command: 'git init -b main' });

    writeFileSync(join(dir, 'a.txt'), 'one');
    expect(await h['git:run'](dir, { kind: 'stage', file: 'a.txt' })).toMatchObject({ ok: true, command: 'git add -- a.txt' });
    expect((await h['git:status'](dir)).files[0]).toMatchObject({ path: 'a.txt', staged: true });
    // 還沒有 commit：HEAD 不存在，unstage 改走 rm --cached
    expect(await h['git:run'](dir, { kind: 'unstage', file: 'a.txt' })).toMatchObject({ ok: true, command: 'git rm --cached -r -- a.txt' });
    expect((await h['git:status'](dir)).files[0]).toMatchObject({ path: 'a.txt', untracked: true });

    await h['git:run'](dir, { kind: 'stageAll' });
    const c = await h['git:run'](dir, { kind: 'commit', message: 'feat: first "quoted"', amend: false });
    expect(c.ok).toBe(true);
    expect(c.command).toBe('git commit -m "feat: first \\"quoted\\""');
    expect((await h['git:status'](dir)).noCommits).toBe(false);

    writeFileSync(join(dir, 'a.txt'), 'two');
    expect(await h['git:run'](dir, { kind: 'unstage', file: 'a.txt' })).toMatchObject({ command: 'git reset HEAD -- a.txt' });
    expect(await h['git:run'](dir, { kind: 'discard', file: 'a.txt', untracked: false })).toMatchObject({ ok: true, command: 'git restore --staged --worktree -- a.txt' });
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('one');
    writeFileSync(join(dir, 'junk.txt'), 'x');
    expect(await h['git:run'](dir, { kind: 'discard', file: 'junk.txt', untracked: true })).toMatchObject({ ok: true, command: 'git clean -fd -- junk.txt' });
    expect(existsSync(join(dir, 'junk.txt'))).toBe(false);

    expect(await h['git:run'](dir, { kind: 'createBranch', branch: 'dev' })).toMatchObject({ ok: true, command: 'git switch -c dev' });
    writeFileSync(join(dir, 'b.txt'), 'dev');
    await h['git:run'](dir, { kind: 'stageAll' });
    await h['git:run'](dir, { kind: 'commit', message: 'dev work', amend: false });
    expect(await h['git:run'](dir, { kind: 'switch', branch: 'main' })).toMatchObject({ ok: true, command: 'git switch main' });
    expect(await h['git:branches'](dir)).toEqual({ current: 'main', all: ['dev', 'main'] });
    expect(await h['git:run'](dir, { kind: 'merge', branch: 'dev' })).toMatchObject({ ok: true, command: 'git merge --no-edit dev' });
    expect(existsSync(join(dir, 'b.txt'))).toBe(true);
    expect(await h['git:diff'](dir, 'b.txt', 'unstaged')).toBe('');
    const head = git(dir, 'rev-parse', '--short', 'HEAD').trim();
    expect(await h['git:show'](dir, head)).toMatch(/b\.txt/);
  });

  it('returns a failed result (not a rejection) for git errors such as a missing remote', async () => {
    const { dir, h } = setup();
    await h['git:run'](dir, { kind: 'init' });
    // 需要至少一個 commit，HEAD 才解析得出來；否則 git 會先在 refspec 卡住，還沒查遠端。
    writeFileSync(join(dir, 'a.txt'), 'one');
    await h['git:run'](dir, { kind: 'stageAll' });
    await h['git:run'](dir, { kind: 'commit', message: 'first', amend: false });
    const r = await h['git:run'](dir, { kind: 'push' });
    expect(r.ok).toBe(false);
    expect(r.command).toBe('git push -u origin HEAD');
    expect(`${r.stdout}\n${r.stderr}`).toMatch(/does not appear to be a git repository/);
  });

  it('stash → tag → revert → reset → abort merge → add remote, with extras in between', async () => {
    const { dir, h } = setup();
    await h['git:run'](dir, { kind: 'init' });
    writeFileSync(join(dir, 'a.txt'), 'one');
    await h['git:run'](dir, { kind: 'stageAll' });
    await h['git:run'](dir, { kind: 'commit', message: 'first', amend: false });

    writeFileSync(join(dir, 'a.txt'), 'two');
    expect(await h['git:run'](dir, { kind: 'stash', message: 'wip' })).toMatchObject({ ok: true, command: 'git stash push -u -m wip' });
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('one');
    expect(await h['git:extras'](dir)).toEqual({ stashes: [{ index: 0, message: 'On main: wip' }], tags: [] });
    expect(await h['git:run'](dir, { kind: 'stashPop', index: 0 })).toMatchObject({ ok: true, command: 'git stash pop stash@{0}' });
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('two');
    await h['git:run'](dir, { kind: 'stash', message: null });
    expect(await h['git:run'](dir, { kind: 'stashDrop', index: 0 })).toMatchObject({ ok: true, command: 'git stash drop stash@{0}' });
    expect((await h['git:extras'](dir)).stashes).toEqual([]);

    expect(await h['git:run'](dir, { kind: 'tag', name: 'v1', hash: null })).toMatchObject({ ok: true, command: 'git tag v1' });
    expect((await h['git:extras'](dir)).tags).toEqual(['v1']);
    expect(await h['git:run'](dir, { kind: 'deleteTag', name: 'v1' })).toMatchObject({ ok: true, command: 'git tag -d v1' });
    expect((await h['git:extras'](dir)).tags).toEqual([]);

    writeFileSync(join(dir, 'b.txt'), 'b');
    await h['git:run'](dir, { kind: 'stageAll' });
    await h['git:run'](dir, { kind: 'commit', message: 'second', amend: false });
    const second = git(dir, 'rev-parse', '--short', 'HEAD').trim();
    expect(await h['git:run'](dir, { kind: 'revert', hash: second })).toMatchObject({ ok: true, command: `git revert --no-edit ${second}` });
    expect(existsSync(join(dir, 'b.txt'))).toBe(false);
    expect(git(dir, 'rev-list', '--count', 'HEAD').trim()).toBe('3');
    expect(await h['git:run'](dir, { kind: 'reset', mode: 'hard', target: 'HEAD~1' })).toMatchObject({ ok: true, command: 'git reset --hard HEAD~1' });
    expect(git(dir, 'rev-list', '--count', 'HEAD').trim()).toBe('2');
    expect(existsSync(join(dir, 'b.txt'))).toBe(true);
    expect(await h['git:run'](dir, { kind: 'reset', mode: 'soft', target: 'HEAD~1' })).toMatchObject({ ok: true, command: 'git reset --soft HEAD~1' });
    expect((await h['git:status'](dir)).files[0]).toMatchObject({ path: 'b.txt', staged: true });
    await h['git:run'](dir, { kind: 'commit', message: 'second again', amend: false });

    await h['git:run'](dir, { kind: 'createBranch', branch: 'dev' });
    writeFileSync(join(dir, 'a.txt'), 'dev side');
    await h['git:run'](dir, { kind: 'stageAll' });
    await h['git:run'](dir, { kind: 'commit', message: 'dev', amend: false });
    await h['git:run'](dir, { kind: 'switch', branch: 'main' });
    writeFileSync(join(dir, 'a.txt'), 'main side');
    await h['git:run'](dir, { kind: 'stageAll' });
    await h['git:run'](dir, { kind: 'commit', message: 'main', amend: false });
    expect((await h['git:run'](dir, { kind: 'merge', branch: 'dev' })).ok).toBe(false);
    expect((await h['git:status'](dir)).merging).toBe(true);
    expect(await h['git:run'](dir, { kind: 'abortMerge' })).toMatchObject({ ok: true, command: 'git merge --abort' });
    expect((await h['git:status'](dir)).merging).toBe(false);
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('main side');

    expect(await h['git:run'](dir, { kind: 'addRemote', url: 'https://github.com/o/r.git' })).toMatchObject({ ok: true, command: 'git remote add origin https://github.com/o/r.git' });
    expect((await h['git:status'](dir)).hasRemote).toBe(true);
    expect(git(dir, 'remote', 'get-url', 'origin').trim()).toBe('https://github.com/o/r.git');
  });
});
