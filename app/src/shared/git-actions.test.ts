import { describe, it, expect } from 'vitest';
import { RESET_MODES, SYNC_COMMAND, buildGitArgs, describeGitAction, formatGitCommand } from './git-actions';
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

describe('buildGitArgs (batch 2)', () => {
  it('maps stash / reset / revert / tag / abort / remote actions', () => {
    expect(buildGitArgs({ kind: 'pullRebase' }, HEAD)).toEqual(['pull', '--rebase']);
    expect(buildGitArgs({ kind: 'stash', message: null }, HEAD)).toEqual(['stash', 'push', '-u']);
    expect(buildGitArgs({ kind: 'stash', message: 'wip 登入' }, HEAD)).toEqual(['stash', 'push', '-u', '-m', 'wip 登入']);
    expect(buildGitArgs({ kind: 'stashPop', index: 1 }, HEAD)).toEqual(['stash', 'pop', 'stash@{1}']);
    expect(buildGitArgs({ kind: 'stashDrop', index: 0 }, HEAD)).toEqual(['stash', 'drop', 'stash@{0}']);
    expect(buildGitArgs({ kind: 'reset', mode: 'hard', target: 'HEAD~1' }, HEAD)).toEqual(['reset', '--hard', 'HEAD~1']);
    expect(buildGitArgs({ kind: 'reset', mode: 'soft', target: 'abc1234' }, HEAD)).toEqual(['reset', '--soft', 'abc1234']);
    expect(buildGitArgs({ kind: 'reset', mode: 'mixed', target: 'HEAD~3' }, NO_HEAD)).toEqual(['reset', '--mixed', 'HEAD~3']);
    expect(buildGitArgs({ kind: 'revert', hash: 'abc1234' }, HEAD)).toEqual(['revert', '--no-edit', 'abc1234']);
    expect(buildGitArgs({ kind: 'tag', name: 'v1', hash: null }, HEAD)).toEqual(['tag', 'v1']);
    expect(buildGitArgs({ kind: 'tag', name: 'v1', hash: 'abc1234' }, HEAD)).toEqual(['tag', 'v1', 'abc1234']);
    expect(buildGitArgs({ kind: 'deleteTag', name: 'v1' }, HEAD)).toEqual(['tag', '-d', 'v1']);
    expect(buildGitArgs({ kind: 'abortMerge' }, HEAD)).toEqual(['merge', '--abort']);
    expect(buildGitArgs({ kind: 'addRemote', url: 'https://github.com/o/r.git' }, HEAD)).toEqual(['remote', 'add', 'origin', 'https://github.com/o/r.git']);
    expect(formatGitCommand(['stash', 'push', '-u', '-m', 'wip 登入'])).toBe('git stash push -u -m "wip 登入"');
    expect(formatGitCommand(['stash', 'pop', 'stash@{1}'])).toBe('git stash pop stash@{1}');
  });
});

describe('describeGitAction (batch 2)', () => {
  it('marks reset --hard and stash drop as dangerous, the rest as normal, with the exact wording', () => {
    const st = status();
    expect(describeGitAction({ kind: 'reset', mode: 'hard', target: 'HEAD~1' }, st)).toEqual({
      title: '重設', danger: true, description: `把目前的 main 退回到 HEAD~1。模式 hard：${RESET_MODES.hard}`,
    });
    expect(describeGitAction({ kind: 'reset', mode: 'soft', target: 'abc1234' }, st)).toMatchObject({ title: '重設', danger: false });
    expect(describeGitAction({ kind: 'reset', mode: 'mixed', target: 'HEAD~2' }, st)?.description).toContain(RESET_MODES.mixed);
    expect(describeGitAction({ kind: 'stashDrop', index: 0 }, st)).toMatchObject({ title: '丟棄收藏', danger: true });
    expect(describeGitAction({ kind: 'stash', message: null }, st)).toMatchObject({ title: '收藏變更', danger: false });
    expect(describeGitAction({ kind: 'stash', message: 'wip' }, st)?.description).toContain('「wip」');
    expect(describeGitAction({ kind: 'stashPop', index: 2 }, st)?.description).toContain('stash@{2}');
    expect(describeGitAction({ kind: 'revert', hash: 'abc1234' }, st)).toMatchObject({ title: '還原提交', danger: false });
    expect(describeGitAction({ kind: 'tag', name: 'v1', hash: null }, st)?.description).toBe('在目前的提交上建立標籤 v1，方便日後找到這個版本。');
    expect(describeGitAction({ kind: 'tag', name: 'v1', hash: 'abc1234' }, st)?.description).toBe('在提交 abc1234 上建立標籤 v1，方便日後找到這個版本。');
    expect(describeGitAction({ kind: 'deleteTag', name: 'v1' }, st)).toMatchObject({ title: '刪除標籤', danger: false });
    expect(describeGitAction({ kind: 'abortMerge' }, st)).toMatchObject({ title: '中止合併', danger: false });
    expect(describeGitAction({ kind: 'addRemote', url: 'https://github.com/o/r.git' }, st)).toMatchObject({ title: '設定遠端', danger: false });
    expect(describeGitAction({ kind: 'pullRebase' }, st)).toMatchObject({ title: '拉取（變基）', danger: false });
  });
});

describe('commitPaths', () => {
  it('commits only the given paths with -- separator', () => {
    expect(buildGitArgs({ kind: 'commitPaths', message: 'docs(verify): 更新清單', paths: ['docs/verify/checklist.md'] }, { hasHead: true }))
      .toEqual(['commit', '-m', 'docs(verify): 更新清單', '--', 'docs/verify/checklist.md']);
  });
  it('describes the action without danger', () => {
    const st = { isRepo: true, branch: 'main', detached: false, noCommits: false, upstream: null, ahead: 0, behind: 0, hasRemote: false, merging: false, files: [] };
    const d = describeGitAction({ kind: 'commitPaths', message: 'm', paths: ['docs/a.md', 'docs/b.md'] }, st);
    expect(d).toEqual({ title: '提交檔案', description: '只提交下列檔案的目前內容（不動其他已暫存的變更）：docs/a.md、docs/b.md。訊息：「m」。', danger: false });
  });
});

describe('applyPatch / sync', () => {
  it('maps applyPatch to git apply --cached reading the patch from stdin, with -R when reversing', () => {
    const patch = 'diff --git a/a.txt b/a.txt\n';
    expect(buildGitArgs({ kind: 'applyPatch', patch, reverse: false }, HEAD)).toEqual(['apply', '--cached', '--whitespace=nowarn', '-']);
    expect(buildGitArgs({ kind: 'applyPatch', patch, reverse: true }, HEAD)).toEqual(['apply', '--cached', '-R', '--whitespace=nowarn', '-']);
    // sync 是多步驟：沒有單一 argv，回半條指令只會誤導呼叫者
    expect(() => buildGitArgs({ kind: 'sync' }, HEAD)).toThrow(/syncRepo/);
    expect(SYNC_COMMAND).toBe('git pull --rebase && git push -u origin HEAD');
  });
  it('needs no confirmation for applyPatch and describes sync exactly', () => {
    expect(describeGitAction({ kind: 'applyPatch', patch: 'diff --git a/a b/a\n', reverse: false }, status())).toBeNull();
    expect(describeGitAction({ kind: 'sync' }, status())).toEqual({
      title: '同步',
      description: '先從遠端拉取並變基，再推送目前分支；還沒有上游分支時直接推送並建立追蹤。若有衝突需要手動解決。',
      danger: false,
    });
  });
});
