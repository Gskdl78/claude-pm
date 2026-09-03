import { describe, it, expect } from 'vitest';
import { buildGitArgs, describeGitAction, formatGitCommand } from './git-actions';
import type { GitStatus } from './types';

const status = (over: Partial<GitStatus> = {}): GitStatus => ({
  isRepo: true, branch: 'main', detached: false, noCommits: false, upstream: null,
  ahead: 2, behind: 0, hasRemote: true, merging: false, files: [], ...over,
});
const HEAD = { hasHead: true };
const NO_HEAD = { hasHead: false };

describe('buildGitArgs', () => {
  it('maps every action to argv, with -- before paths', () => {
    expect(buildGitArgs({ kind: 'init' }, HEAD)).toEqual(['init', '-b', 'main']);
    expect(buildGitArgs({ kind: 'stage', file: 'a b.txt' }, HEAD)).toEqual(['add', '--', 'a b.txt']);
    expect(buildGitArgs({ kind: 'stageAll' }, HEAD)).toEqual(['add', '-A']);
    expect(buildGitArgs({ kind: 'unstage', file: 'a.txt' }, HEAD)).toEqual(['reset', 'HEAD', '--', 'a.txt']);
    expect(buildGitArgs({ kind: 'unstage', file: 'a.txt' }, NO_HEAD)).toEqual(['rm', '--cached', '-r', '--', 'a.txt']);
    expect(buildGitArgs({ kind: 'unstageAll' }, HEAD)).toEqual(['reset', 'HEAD']);
    expect(buildGitArgs({ kind: 'unstageAll' }, NO_HEAD)).toEqual(['rm', '--cached', '-r', '--', '.']);
    expect(buildGitArgs({ kind: 'discard', file: 'n.txt', untracked: true }, HEAD)).toEqual(['clean', '-fd', '--', 'n.txt']);
    expect(buildGitArgs({ kind: 'discard', file: 'a.txt', untracked: false }, HEAD)).toEqual(['restore', '--staged', '--worktree', '--', 'a.txt']);
    expect(buildGitArgs({ kind: 'discard', file: 'a.txt', untracked: false }, NO_HEAD)).toEqual(['rm', '-r', '-f', '--', 'a.txt']);
    expect(buildGitArgs({ kind: 'commit', message: 'feat: x', amend: false }, HEAD)).toEqual(['commit', '-m', 'feat: x']);
    expect(buildGitArgs({ kind: 'commit', message: 'feat: x', amend: true }, HEAD)).toEqual(['commit', '--amend', '-m', 'feat: x']);
    expect(buildGitArgs({ kind: 'switch', branch: 'dev' }, HEAD)).toEqual(['switch', 'dev']);
    expect(buildGitArgs({ kind: 'createBranch', branch: 'dev' }, HEAD)).toEqual(['switch', '-c', 'dev']);
    expect(buildGitArgs({ kind: 'merge', branch: 'dev' }, HEAD)).toEqual(['merge', '--no-edit', 'dev']);
    expect(buildGitArgs({ kind: 'push' }, HEAD)).toEqual(['push', '-u', 'origin', 'HEAD']);
    expect(buildGitArgs({ kind: 'pull' }, HEAD)).toEqual(['pull']);
    expect(buildGitArgs({ kind: 'fetch' }, HEAD)).toEqual(['fetch']);
  });
});

describe('formatGitCommand', () => {
  it('quotes arguments containing whitespace or quotes', () => {
    expect(formatGitCommand(['add', '--', 'a.txt'])).toBe('git add -- a.txt');
    expect(formatGitCommand(['commit', '-m', 'feat: say "hi"'])).toBe('git commit -m "feat: say \\"hi\\""');
    expect(formatGitCommand(['add', '--', 'my file.txt'])).toBe('git add -- "my file.txt"');
  });
});

describe('describeGitAction', () => {
  it('skips confirmation for stage/unstage/fetch', () => {
    const quiet = [
      { kind: 'stage', file: 'a' }, { kind: 'unstage', file: 'a' },
      { kind: 'stageAll' }, { kind: 'unstageAll' }, { kind: 'fetch' },
    ] as const;
    for (const a of quiet) expect(describeGitAction(a, status())).toBeNull();
  });

  it('marks discard and amend as dangerous and fills in counts', () => {
    const st = status({ files: [{ path: 'a', index: 'M', work: ' ', staged: true, unstaged: false, untracked: false, conflicted: false }] });
    expect(describeGitAction({ kind: 'discard', file: 'a', untracked: false }, st)).toMatchObject({ title: '丟棄', danger: true });
    expect(describeGitAction({ kind: 'discard', file: 'n', untracked: true }, st)?.description).toMatch(/刪除尚未加入版本控制的 n/);
    expect(describeGitAction({ kind: 'commit', message: 'x', amend: true }, st)).toMatchObject({ title: '修改上一次提交', danger: true });
    expect(describeGitAction({ kind: 'commit', message: 'x', amend: false }, st)).toEqual({
      title: '提交', danger: false, description: '將已暫存的 1 個檔案提交到本地紀錄，訊息：「x」。',
    });
    expect(describeGitAction({ kind: 'push' }, st)?.description).toBe('將 main 分支的 2 個提交上傳到遠端（origin）。');
    expect(describeGitAction({ kind: 'push' }, status({ ahead: 0 }))?.description).toBe('將 main 分支的本地提交上傳到遠端（origin）。');
    expect(describeGitAction({ kind: 'switch', branch: 'dev' }, st)?.description).toMatch(/從 main 切換到 dev/);
    expect(describeGitAction({ kind: 'merge', branch: 'dev' }, st)).toMatchObject({ title: '合併', danger: false });
    expect(describeGitAction({ kind: 'pull' }, st)).toMatchObject({ title: '拉取', danger: false });
    expect(describeGitAction({ kind: 'init' }, status({ isRepo: false }))).toMatchObject({ title: '初始化', danger: false });
  });
});
