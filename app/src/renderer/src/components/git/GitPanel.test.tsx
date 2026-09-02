import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { GitBranches, GitResult, GitStatus } from '../../../../shared/types';

const git = vi.hoisted(() => ({
  status: vi.fn(), branches: vi.fn(), diff: vi.fn(), show: vi.fn(), run: vi.fn(),
}));
vi.mock('../../api', () => ({ pm: { git } }));

import { GitPanel } from './GitPanel';

const P = 'C:\\P\\alpha';
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
    expect(await screen.findByText(/推送被拒/)).toBeInTheDocument();
    expect(screen.getByText('! [rejected] main -> main (fetch first)')).toBeInTheDocument();
  });

  it('logs a hint instead of pushing when there is no remote', async () => {
    git.status.mockResolvedValue(st({ hasRemote: false, upstream: null }));
    render(<GitPanel path={P} commits={[]} revision={0} />);
    expect(await screen.findByText('無遠端')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '推送' }));
    expect(await screen.findByText(/尚未設定遠端倉庫/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(git.run).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '擷取' })).toBeDisabled();
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
    fireEvent.click(screen.getByRole('button', { name: /abc1234/ }));
    await waitFor(() => expect(git.show).toHaveBeenCalledWith(P, 'abc1234'));
    expect(await screen.findByRole('dialog', { name: '提交：abc1234' })).toBeInTheDocument();
    expect(screen.getByText('+one')).toHaveClass('add');
    fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    fireEvent.click(screen.getByRole('tab', { name: '分支' }));
    expect(screen.getByLabelText('切換到')).toBeInTheDocument();
  });

  it('re-reads status when revision changes', async () => {
    const { rerender } = render(<GitPanel path={P} commits={[]} revision={0} />);
    await screen.findByText('main');
    const n = git.status.mock.calls.length;
    rerender(<GitPanel path={P} commits={[]} revision={1} />);
    await waitFor(() => expect(git.status.mock.calls.length).toBeGreaterThan(n));
  });
});
