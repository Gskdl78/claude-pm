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
    await expect(h['git:run'](dir, { kind: 'reset' } as never)).rejects.toThrow(/invalid action/);
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
});
