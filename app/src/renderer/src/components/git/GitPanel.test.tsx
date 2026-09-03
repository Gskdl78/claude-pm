import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { GitBranches, GitResult, GitStatus } from '../../../../shared/types';

const git = vi.hoisted(() => ({
  status: vi.fn(), branches: vi.fn(), diff: vi.fn(), show: vi.fn(), run: vi.fn(), extras: vi.fn(),
}));
const gh = vi.hoisted(() => ({ check: vi.fn(), repoCreate: vi.fn() }));
vi.mock('../../api', () => ({ pm: { git, gh } }));

import { GitPanel } from './GitPanel';
import { buildHunkPatch, splitHunks } from '../../../../shared/diff-hunks';

const P = 'C:\\P\\alpha';
const P2 = 'C:\\P\\beta';
const st = (over: Partial<GitStatus> = {}): GitStatus => ({
  isRepo: true, branch: 'main', detached: false, noCommits: false, upstream: 'origin/main',
  ahead: 0, behind: 0, hasRemote: true, merging: false, files: [], ...over,
});
const unstagedFile = { path: 'a.txt', index: ' ', work: 'M', staged: false, unstaged: true, untracked: false, conflicted: false };
const stagedFile = { path: 'a.txt', index: 'M', work: ' ', staged: true, unstaged: false, untracked: false, conflicted: false };
const ok = (command: string): GitResult => ({ ok: true, code: 0, stdout: '', stderr: '', command });

beforeEach(() => {
  vi.clearAllMocks();
  git.status.mockResolvedValue(st());
  git.branches.mockResolvedValue({ current: 'main', all: ['dev', 'main'] } as GitBranches);
  git.run.mockImplementation(async (_p: string, a: { kind: string }) => ok(`git ${a.kind}`));
  git.diff.mockResolvedValue('');
  git.show.mockResolvedValue('');
  git.extras.mockResolvedValue({ stashes: [], tags: [] });
  gh.check.mockResolvedValue({ installed: true, version: 'gh version 2.60.0', authed: true, detail: '' });
  gh.repoCreate.mockResolvedValue(ok('gh repo create alpha --private --source=. --remote=origin --push'));
});

describe('GitPanel', () => {
  it('shows a placeholder without a project', () => {
    render(<GitPanel path={null} commits={[]} revision={0} />);
    expect(screen.getByText('選擇專案後顯示 git 狀態')).toBeInTheDocument();
    expect(git.status).not.toHaveBeenCalled();
  });

  it('offers init for a non-repo and switches to the full panel after confirming', async () => {
    git.status.mockResolvedValueOnce(st({ isRepo: false }));
    render(<GitPanel path={P} commits={[]} revision={0} />);
    fireEvent.click(await screen.findByRole('button', { name: '初始化' }));
    expect(await screen.findByText('git init -b main')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    await waitFor(() => expect(git.run).toHaveBeenCalledWith(P, { kind: 'init' }));
    expect(await screen.findByText('main')).toBeInTheDocument();
    expect(screen.getByText('> git init')).toBeInTheDocument();
    expect(screen.getByText('完成 ✓')).toBeInTheDocument();
  });

  it('stages a file without confirmation and re-reads status', async () => {
    git.status.mockResolvedValue(st({ files: [unstagedFile] }));
    render(<GitPanel path={P} commits={[]} revision={0} />);
    const calls = await waitFor(() => { expect(git.status).toHaveBeenCalled(); return git.status.mock.calls.length; });
    fireEvent.click(await screen.findByRole('button', { name: '加入暫存：a.txt' }));
    await waitFor(() => expect(git.run).toHaveBeenCalledWith(P, { kind: 'stage', file: 'a.txt' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(git.status.mock.calls.length).toBeGreaterThan(calls));
  });

  it('asks a danger confirmation for discard with the exact command, and cancel runs nothing', async () => {
    git.status.mockResolvedValue(st({ files: [unstagedFile] }));
    render(<GitPanel path={P} commits={[]} revision={0} />);
    fireEvent.click(await screen.findByRole('button', { name: '丟棄變更：a.txt' }));
    expect(await screen.findByText('git restore --staged --worktree -- a.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '我了解風險，執行' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(git.run).not.toHaveBeenCalled();
  });

  it('explains a rejected push in plain language with the raw output', async () => {
    git.run.mockResolvedValue({ ok: false, code: 1, stdout: '', stderr: '! [rejected] main -> main (fetch first)', command: 'git push -u origin HEAD' });
    render(<GitPanel path={P} commits={[]} revision={0} />);
    fireEvent.click(await screen.findByRole('button', { name: '推送' }));
    expect(await screen.findByText('git push -u origin HEAD')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    expect(await within(screen.getByRole('log', { name: '輸出' })).findByText(/推送被拒/)).toBeInTheDocument();
    expect(screen.getByText('! [rejected] main -> main (fetch first)')).toBeInTheDocument();
  });

  it('opens the publish wizard when there is no remote and publishes by url as remote-add then push', async () => {
    git.status.mockResolvedValue(st({ hasRemote: false, upstream: null }));
    render(<GitPanel path={P} commits={[]} revision={0} />);
    expect(await screen.findByText('無遠端')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '擷取' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '推送' }));
    const wizard = await screen.findByRole('dialog', { name: '發佈到 GitHub' });
    expect(gh.check).toHaveBeenCalledWith(P);
    await within(wizard).findByText('登入狀態：已登入');
    fireEvent.click(within(wizard).getByLabelText('貼現有倉庫網址'));
    fireEvent.change(within(wizard).getByLabelText('倉庫網址'), { target: { value: 'https://github.com/o/r.git' } });
    fireEvent.click(within(wizard).getByRole('button', { name: '下一步' }));
    expect(screen.queryByRole('dialog', { name: '發佈到 GitHub' })).not.toBeInTheDocument();
    // 指令區是兩行，Testing Library 的預設正規化會把換行折成空白
    expect(await screen.findByText('git remote add origin https://github.com/o/r.git git push -u origin HEAD')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    await waitFor(() => expect(git.run).toHaveBeenCalledTimes(2));
    expect(git.run.mock.calls.map((c) => c[1])).toEqual([{ kind: 'addRemote', url: 'https://github.com/o/r.git' }, { kind: 'push' }]);
    expect(screen.getAllByText('完成 ✓')).toHaveLength(2);
  });

  it('creates a GitHub repo through gh after confirming the exact gh command', async () => {
    git.status.mockResolvedValue(st({ hasRemote: false, upstream: null }));
    render(<GitPanel path={P} commits={[]} revision={0} />);
    fireEvent.click(await screen.findByRole('button', { name: '拉取' }));
    const wizard = await screen.findByRole('dialog', { name: '發佈到 GitHub' });
    await within(wizard).findByText('登入狀態：已登入');
    expect(within(wizard).getByLabelText('倉庫名稱')).toHaveValue('alpha');
    fireEvent.click(within(wizard).getByRole('button', { name: '下一步' }));
    expect(await screen.findByText('gh repo create alpha --private --source=. --remote=origin --push')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確認' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    await waitFor(() => expect(gh.repoCreate).toHaveBeenCalledWith(P, 'alpha', true));
    expect(await screen.findByText('> gh repo create alpha --private --source=. --remote=origin --push')).toBeInTheDocument();
    expect(screen.getByText('完成 ✓')).toBeInTheDocument();
    expect(git.run).not.toHaveBeenCalled();
  });

  it('stops the url publish at remote-add when it fails', async () => {
    git.status.mockResolvedValue(st({ hasRemote: false, upstream: null }));
    git.run.mockResolvedValue({ ok: false, code: 3, stdout: '', stderr: 'error: remote origin already exists.', command: 'git remote add origin https://github.com/o/r.git' });
    render(<GitPanel path={P} commits={[]} revision={0} />);
    fireEvent.click(await screen.findByRole('button', { name: '推送' }));
    const wizard = await screen.findByRole('dialog', { name: '發佈到 GitHub' });
    await within(wizard).findByText('登入狀態：已登入');
    fireEvent.click(within(wizard).getByLabelText('貼現有倉庫網址'));
    fireEvent.change(within(wizard).getByLabelText('倉庫網址'), { target: { value: 'https://github.com/o/r.git' } });
    fireEvent.click(within(wizard).getByRole('button', { name: '下一步' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認' }));
    expect(await screen.findByText(/已經設定過遠端 origin/)).toBeInTheDocument();
    expect(git.run).toHaveBeenCalledTimes(1);
  });

  it('offers abort-merge in the banner and runs git merge --abort after confirmation', async () => {
    git.status.mockResolvedValue(st({ merging: true, files: [{ ...unstagedFile, index: 'U', work: 'U', unstaged: false, conflicted: true }] }));
    render(<GitPanel path={P} commits={[]} revision={0} />);
    fireEvent.click(await screen.findByRole('button', { name: '中止合併' }));
    expect(await screen.findByText('git merge --abort')).toBeInTheDocument();
    expect(screen.getByText('確認：中止合併')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    await waitFor(() => expect(git.run).toHaveBeenCalledWith(P, { kind: 'abortMerge' }));
  });

  it('hides abort-merge when conflicts come from something other than a merge', async () => {
    git.status.mockResolvedValue(st({ merging: false, files: [{ ...unstagedFile, index: 'U', work: 'U', unstaged: false, conflicted: true }] }));
    render(<GitPanel path={P} commits={[]} revision={0} />);
    expect(await screen.findByText(/有衝突：1 個檔案有衝突/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '中止合併' })).not.toBeInTheDocument();
  });

  it('reverts a commit from history and hands reset-to-here / tag-here to the advanced tab', async () => {
    render(<GitPanel path={P} commits={[{ hash: 'abc1234', date: '2026-09-02T10:00:00+08:00', message: 'chore: init' }]} revision={0} />);
    fireEvent.click(await screen.findByRole('tab', { name: '歷史' }));
    fireEvent.click(screen.getByRole('button', { name: '還原提交：abc1234' }));
    expect(await screen.findByText('git revert --no-edit abc1234')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確認' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    fireEvent.click(screen.getByRole('button', { name: '重設到此：abc1234' }));
    expect(screen.getByRole('tab', { name: '進階' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('重設目標')).toHaveValue('abc1234');
    await waitFor(() => expect(git.extras).toHaveBeenCalledWith(P));
    fireEvent.click(screen.getByLabelText('hard'));
    fireEvent.click(screen.getByRole('button', { name: '重設' }));
    expect(await screen.findByText('git reset --hard abc1234')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '我了解風險，執行' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(git.run).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: '歷史' }));
    fireEvent.click(screen.getByRole('button', { name: '在此建立標籤：abc1234' }));
    expect(screen.getByRole('tab', { name: '進階' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('abc1234', { selector: 'code' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('標籤名稱'), { target: { value: 'v1' } });
    fireEvent.click(screen.getByRole('button', { name: '建立標籤' }));
    expect(await screen.findByText('git tag v1 abc1234')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    await waitFor(() => expect(git.run).toHaveBeenCalledWith(P, { kind: 'tag', name: 'v1', hash: 'abc1234' }));
    await waitFor(() => expect(screen.getByLabelText('標籤名稱')).toHaveValue(''));
  });

  it('stashes from the advanced tab and lists stashes and tags from extras', async () => {
    git.status.mockResolvedValue(st({ files: [unstagedFile] }));
    git.extras.mockResolvedValue({ stashes: [{ index: 0, message: 'On main: wip' }], tags: ['v1'] });
    render(<GitPanel path={P} commits={[]} revision={0} />);
    fireEvent.click(await screen.findByRole('tab', { name: '進階' }));
    expect(await screen.findByText('stash@{0}')).toBeInTheDocument();
    expect(screen.getByText('On main: wip')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('收藏說明（選填）'), { target: { value: '暫時' } });
    fireEvent.click(screen.getByRole('button', { name: '收藏目前變更' }));
    expect(await screen.findByText('git stash push -u -m 暫時')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    await waitFor(() => expect(git.run).toHaveBeenCalledWith(P, { kind: 'stash', message: '暫時' }));
    await waitFor(() => expect(screen.getByLabelText('收藏說明（選填）')).toHaveValue(''));
    fireEvent.click(screen.getByRole('button', { name: '丟棄收藏：stash@{0}' }));
    expect(await screen.findByText('git stash drop stash@{0}')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '我了解風險，執行' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getByRole('button', { name: '取回收藏：stash@{0}' }));
    expect(await screen.findByText('git stash pop stash@{0}')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確認' })).toBeInTheDocument();
  });

  it('after a rejected push offers fetch and pull --rebase but never a force push', async () => {
    git.run.mockResolvedValue({ ok: false, code: 1, stdout: '', stderr: '! [rejected] main -> main (fetch first)', command: 'git push -u origin HEAD' });
    render(<GitPanel path={P} commits={[]} revision={0} />);
    fireEvent.click(await screen.findByRole('button', { name: '推送' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認' }));
    const bar = await screen.findByRole('status');
    expect(bar).toHaveTextContent('推送被拒');
    expect(within(bar).getByRole('button', { name: '先擷取' })).toBeInTheDocument();
    expect(screen.queryByText(/強制/)).toBeInTheDocument();   // 提示文字說明「不提供強制推送」
    expect(screen.queryByRole('button', { name: /強制/ })).not.toBeInTheDocument();
    fireEvent.click(within(bar).getByRole('button', { name: '拉取（變基）' }));
    expect(await screen.findByText('git pull --rebase')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    await waitFor(() => expect(git.run).toHaveBeenCalledWith(P, { kind: 'pullRebase' }));
    fireEvent.click(within(bar).getByRole('button', { name: '關閉推送提示' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('commits after confirmation and clears the message', async () => {
    git.status.mockResolvedValue(st({ files: [stagedFile] }));
    render(<GitPanel path={P} commits={[]} revision={0} />);
    fireEvent.change(await screen.findByLabelText('commit 訊息'), { target: { value: 'feat: x' } });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(await screen.findByText('git commit -m "feat: x"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    await waitFor(() => expect(git.run).toHaveBeenCalledWith(P, { kind: 'commit', message: 'feat: x', amend: false }));
    await waitFor(() => expect(screen.getByLabelText('commit 訊息')).toHaveValue(''));
  });

  it('shows the conflict banner while merging', async () => {
    git.status.mockResolvedValue(st({ merging: true, files: [{ ...unstagedFile, index: 'U', work: 'U', unstaged: false, conflicted: true }] }));
    render(<GitPanel path={P} commits={[]} revision={0} />);
    expect(await screen.findByText(/合併進行中：1 個檔案有衝突/)).toBeInTheDocument();
  });

  it('switches tabs and opens a commit from history', async () => {
    git.show.mockResolvedValue('commit abc1234\n+one');
    render(<GitPanel path={P} commits={[{ hash: 'abc1234', date: '2026-09-02T10:00:00+08:00', message: 'chore: init' }]} revision={0} />);
    fireEvent.click(await screen.findByRole('tab', { name: '歷史' }));
    fireEvent.click(screen.getByRole('button', { name: '查看提交：abc1234' }));
    await waitFor(() => expect(git.show).toHaveBeenCalledWith(P, 'abc1234'));
    expect(await screen.findByRole('dialog', { name: '提交：abc1234' })).toBeInTheDocument();
    expect(screen.getByText('+one')).toHaveClass('add');
    fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    fireEvent.click(screen.getByRole('tab', { name: '分支' }));
    expect(screen.getByLabelText('切換到')).toBeInTheDocument();
  });

  it('switches to history and opens the commit when revealCommit changes', async () => {
    git.show.mockResolvedValue('commit abc1234\n\n    feat: x');
    const { rerender } = render(<GitPanel path={P} commits={[]} revision={0} />);
    await screen.findByText('main');
    rerender(<GitPanel path={P} commits={[]} revision={0} revealCommit={{ hash: 'abc1234', seq: 1 }} />);
    await waitFor(() => expect(git.show).toHaveBeenCalledWith(P, 'abc1234'));
    expect(screen.getByRole('tab', { name: '歷史' })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows the error instead of an endless loading message when the first status read fails', async () => {
    git.status.mockRejectedValue(new Error('boom'));
    render(<GitPanel path={P} commits={[]} revision={0} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('讀取 git 狀態失敗：boom');
    expect(screen.queryByText('讀取 git 狀態…')).not.toBeInTheDocument();
  });

  it('logs a repeated status failure only once', async () => {
    git.status.mockRejectedValue(new Error('boom'));
    render(<GitPanel path={P} commits={[]} revision={0} />);
    await screen.findByRole('alert');
    const first = git.status.mock.calls.length;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(git.status.mock.calls.length).toBeGreaterThan(first));
    const out = screen.getByRole('log', { name: '輸出' });
    expect(within(out).getAllByText('讀取 git 狀態失敗：boom')).toHaveLength(1);
  });

  it('drops an action result when the project changed while it was running', async () => {
    let release!: (r: GitResult) => void;
    git.run.mockImplementationOnce(() => new Promise<GitResult>((res) => { release = res; }));
    const { rerender } = render(<GitPanel path={P} commits={[]} revision={0} />);
    fireEvent.click(await screen.findByRole('button', { name: '推送' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認' }));
    await waitFor(() => expect(git.run).toHaveBeenCalledWith(P, { kind: 'push' }));

    rerender(<GitPanel path={P2} commits={[]} revision={0} />);
    await waitFor(() => expect(git.status).toHaveBeenCalledWith(P2));
    git.status.mockClear();
    await act(async () => { release(ok('git push -u origin HEAD')); });

    const out = screen.getByRole('log', { name: '輸出' });
    expect(within(out).getByText('尚未執行任何操作')).toBeInTheDocument();
    expect(within(out).queryByText('> git push -u origin HEAD')).not.toBeInTheDocument();
    expect(within(out).queryByText('完成 ✓')).not.toBeInTheDocument();
    expect(git.status).not.toHaveBeenCalledWith(P);
  });

  it('keeps typed commit message, amend and new branch name across tab switches, and clears them on project switch', async () => {
    git.status.mockResolvedValue(st({ files: [stagedFile] }));
    const { rerender } = render(<GitPanel path={P} commits={[]} revision={0} />);
    fireEvent.change(await screen.findByLabelText('commit 訊息'), { target: { value: 'feat: keep me' } });
    fireEvent.click(screen.getByLabelText('修改上一次提交'));

    fireEvent.click(screen.getByRole('tab', { name: '分支' }));
    fireEvent.change(screen.getByLabelText('新分支名稱'), { target: { value: 'feature/keep' } });
    fireEvent.click(screen.getByRole('tab', { name: /^變更/ }));
    expect(screen.getByLabelText('commit 訊息')).toHaveValue('feat: keep me');
    expect(screen.getByLabelText('修改上一次提交')).toBeChecked();
    fireEvent.click(screen.getByRole('tab', { name: '分支' }));
    expect(screen.getByLabelText('新分支名稱')).toHaveValue('feature/keep');

    rerender(<GitPanel path={P2} commits={[]} revision={0} />);
    await waitFor(() => expect(git.status).toHaveBeenCalledWith(P2));
    expect(await screen.findByLabelText('commit 訊息')).toHaveValue('');
    expect(screen.getByLabelText('修改上一次提交')).not.toBeChecked();
    fireEvent.click(screen.getByRole('tab', { name: '分支' }));
    expect(screen.getByLabelText('新分支名稱')).toHaveValue('');
  });

  it('re-reads status when revision changes', async () => {
    const { rerender } = render(<GitPanel path={P} commits={[]} revision={0} />);
    await screen.findByText('main');
    const n = git.status.mock.calls.length;
    rerender(<GitPanel path={P} commits={[]} revision={1} />);
    await waitFor(() => expect(git.status.mock.calls.length).toBeGreaterThan(n));
  });

  it('resizes the output log with the drag handle', async () => {
    render(<GitPanel path={P} commits={[]} revision={0} />);
    const log = () => (screen.getByRole('log', { name: '輸出' }).parentElement as HTMLElement).style.height;
    await screen.findByRole('log', { name: '輸出' });
    expect(log()).toBe('160px');
    const handle = screen.getByRole('separator');
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0, clientY: 400 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 360 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 360 });
    expect(log()).toBe('200px');
    fireEvent.doubleClick(handle);
    expect(log()).toBe('160px');
  });

  it('writes each new notice into the output log exactly once', async () => {
    const { rerender } = render(<GitPanel path={P} commits={[]} revision={0} notices={[]} />);
    await screen.findByText('main');
    rerender(<GitPanel path={P} commits={[]} revision={0} notices={[{ id: 1, text: '階段 環境搭建 完成 → 產品設計' }]} />);
    expect((await screen.findByText('階段 環境搭建 完成 → 產品設計')).closest('.out')).toHaveClass('hint');
    rerender(<GitPanel path={P} commits={[]} revision={0} notices={[{ id: 1, text: '階段 環境搭建 完成 → 產品設計' }]} />);
    rerender(<GitPanel path={P} commits={[]} revision={0} notices={[{ id: 1, text: '階段 環境搭建 完成 → 產品設計' }, { id: 2, text: '階段 產品設計 完成 → 技術設計' }]} />);
    expect(await screen.findByText('階段 產品設計 完成 → 技術設計')).toBeInTheDocument();
    expect(screen.getAllByText(/^階段 /)).toHaveLength(2);
  });

  it('writes an error notice with the error class', async () => {
    const { rerender } = render(<GitPanel path={P} commits={[]} revision={0} notices={[]} />);
    await screen.findByText('main');
    rerender(<GitPanel path={P} commits={[]} revision={0} notices={[{ id: 1, text: '驗證清單提交失敗：boom', kind: 'error' }]} />);
    expect((await screen.findByText('驗證清單提交失敗：boom')).closest('.out')).toHaveClass('error');
  });

  it('keeps a notice that arrives together with a project switch', async () => {
    const { rerender } = render(<GitPanel path={P} commits={[]} revision={0} notices={[]} />);
    await screen.findByText('main');
    // 同一次 render 換專案又收到提示：清空輸出的 effect 必須先跑，提示才不會被洗掉
    rerender(<GitPanel path={P2} commits={[]} revision={0} notices={[{ id: 1, text: '階段 環境搭建 完成 → 產品設計' }]} />);
    // 換專案會重新挂載面板內容，等新專案的狀態讀完再查輸出區
    await screen.findByText('main');
    expect(await screen.findByText('階段 環境搭建 完成 → 產品設計')).toBeInTheDocument();
  });
});

const TWO_HUNKS = [
  'diff --git a/a.txt b/a.txt', 'index 1111111..2222222 100644', '--- a/a.txt', '+++ b/a.txt',
  '@@ -1,2 +1,3 @@', ' one', '+added', ' two',
  '@@ -10,2 +11,2 @@', '-old', '+new', ' tail',
].join('\n') + '\n';

describe('GitPanel (git panel polish)', () => {
  it('stages a single hunk from the diff view without confirmation, re-reads the diff and closes it when empty', async () => {
    git.status.mockResolvedValue(st({ files: [unstagedFile] }));
    git.diff.mockResolvedValueOnce(TWO_HUNKS);
    render(<GitPanel path={P} commits={[]} revision={0} stage={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'a.txt' }));
    const dialog = await screen.findByRole('dialog', { name: '差異：a.txt' });
    expect(git.diff).toHaveBeenCalledWith(P, 'a.txt', 'unstaged');
    const diffCalls = git.diff.mock.calls.length;
    fireEvent.click(within(dialog).getAllByRole('button', { name: '暫存此段' })[1]!);
    await waitFor(() => expect(git.run).toHaveBeenCalledWith(P, {
      kind: 'applyPatch', patch: buildHunkPatch(splitHunks(TWO_HUNKS), 1), reverse: false,
    }));
    expect(screen.queryByText(/^確認：/)).not.toBeInTheDocument();
    await waitFor(() => expect(git.diff.mock.calls.length).toBeGreaterThan(diffCalls));
    // 重讀的必須是同一個檔案與同一種 diff，否則會拿別份內容覆蓋 viewer
    expect(git.diff).toHaveBeenLastCalledWith(P, 'a.txt', 'unstaged');
    // 重讀回空字串（沒有剩餘差異）→ 關閉 diff 視窗
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '差異：a.txt' })).not.toBeInTheDocument());
    expect(screen.getByText('> git applyPatch')).toBeInTheDocument();
  });

  it('keeps the diff view open with the remaining hunks and unstages from a staged diff', async () => {
    git.status.mockResolvedValue(st({ files: [stagedFile] }));
    const rest = TWO_HUNKS.split('\n').slice(0, 8).join('\n') + '\n';
    git.diff.mockResolvedValueOnce(TWO_HUNKS).mockResolvedValueOnce(rest);
    render(<GitPanel path={P} commits={[]} revision={0} stage={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'a.txt' }));
    const dialog = await screen.findByRole('dialog', { name: '差異：a.txt' });
    expect(git.diff).toHaveBeenCalledWith(P, 'a.txt', 'staged');
    fireEvent.click(within(dialog).getAllByRole('button', { name: '取消暫存此段' })[1]!);
    await waitFor(() => expect(git.run).toHaveBeenCalledWith(P, expect.objectContaining({ kind: 'applyPatch', reverse: true })));
    await waitFor(() => expect(within(dialog).getAllByRole('button', { name: '取消暫存此段' })).toHaveLength(1));
    expect(screen.getByRole('dialog', { name: '差異：a.txt' })).toBeInTheDocument();
    expect(git.diff).toHaveBeenLastCalledWith(P, 'a.txt', 'staged');
  });

  it('runs sync after a confirmation that names the full command', async () => {
    render(<GitPanel path={P} commits={[]} revision={0} stage={null} />);
    fireEvent.click(await screen.findByRole('button', { name: '同步' }));
    expect(await screen.findByText('確認：同步')).toBeInTheDocument();
    expect(screen.getByText('git pull --rebase && git push -u origin HEAD')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    await waitFor(() => expect(git.run).toHaveBeenCalledWith(P, { kind: 'sync' }));
  });

  it('disables sync without a remote', async () => {
    git.status.mockResolvedValue(st({ hasRemote: false, upstream: null }));
    render(<GitPanel path={P} commits={[]} revision={0} stage={null} />);
    expect(await screen.findByRole('button', { name: '同步' })).toBeDisabled();
  });

  it('keeps the rejected banner after a successful fetch and clears it after pull --rebase', async () => {
    git.run.mockImplementation(async (_p: string, a: { kind: string }) => (a.kind === 'push'
      ? { ok: false, code: 1, stdout: '', stderr: '! [rejected] main -> main (fetch first)', command: 'git push -u origin HEAD' }
      : ok(`git ${a.kind}`)));
    render(<GitPanel path={P} commits={[]} revision={0} stage={null} />);
    fireEvent.click(await screen.findByRole('button', { name: '推送' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認' }));
    const bar = await screen.findByRole('status');
    fireEvent.click(within(bar).getByRole('button', { name: '先擷取' }));
    await waitFor(() => expect(git.run).toHaveBeenCalledWith(P, { kind: 'fetch' }));
    await screen.findByText('> git fetch');
    expect(screen.getByRole('status')).toBeInTheDocument();
    fireEvent.click(within(bar).getByRole('button', { name: '拉取（變基）' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認' }));
    await waitFor(() => expect(git.run).toHaveBeenCalledWith(P, { kind: 'pullRebase' }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('hands the stage down to the commit box prefix row', async () => {
    render(<GitPanel path={P} commits={[]} revision={0} stage="build" />);
    expect(await screen.findByRole('button', { name: 'feat:' })).toHaveClass('primary');
    expect(screen.getByRole('button', { name: 'docs(design):' })).not.toHaveClass('primary');
  });
});
