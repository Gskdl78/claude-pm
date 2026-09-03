import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChangesTab, type ChangesTabProps } from './ChangesTab';
import type { GitFileChange, GitStatus } from '../../../../shared/types';

type HostProps = Omit<ChangesTabProps, 'message' | 'amend' | 'onMessageChange' | 'onAmendChange'>;

/** commit 輸入由 GitPanel 保管，測試用這個小殼提供狀態。 */
function Host(props: HostProps) {
  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);
  return <ChangesTab {...props} message={message} amend={amend} onMessageChange={setMessage} onAmendChange={setAmend} />;
}

const file = (over: Partial<GitFileChange>): GitFileChange => ({
  path: 'a.txt', index: ' ', work: 'M', staged: false, unstaged: true, untracked: false, conflicted: false, ...over,
});
const status = (files: GitFileChange[]): GitStatus => ({
  isRepo: true, branch: 'main', detached: false, noCommits: false, upstream: null,
  ahead: 0, behind: 0, hasRemote: true, merging: false, files,
});
const callbacks = () => ({
  onStage: vi.fn(), onUnstage: vi.fn(), onStageAll: vi.fn(), onUnstageAll: vi.fn(),
  onDiscard: vi.fn(), onDiff: vi.fn(), onCommit: vi.fn(),
});

describe('ChangesTab', () => {
  it('groups files and fires stage / unstage / discard / diff / bulk callbacks', () => {
    const files = [
      file({ path: 's.txt', index: 'M', work: ' ', staged: true, unstaged: false }),
      file({ path: 'u.txt' }),
      file({ path: 'n.txt', index: '?', work: '?', unstaged: false, untracked: true }),
      file({ path: 'c.txt', index: 'U', work: 'U', unstaged: false, conflicted: true }),
    ];
    const cb = callbacks();
    render(<Host status={status(files)} busy={false} {...cb} />);
    expect(screen.getByText('衝突（1）')).toBeInTheDocument();
    expect(screen.getByText('已暫存（1）')).toBeInTheDocument();
    expect(screen.getByText('未暫存（2）')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '加入暫存：u.txt' }));
    expect(cb.onStage).toHaveBeenCalledWith('u.txt');
    fireEvent.click(screen.getByRole('button', { name: '取消暫存：s.txt' }));
    expect(cb.onUnstage).toHaveBeenCalledWith('s.txt');
    fireEvent.click(screen.getByRole('button', { name: '丟棄變更：n.txt' }));
    expect(cb.onDiscard).toHaveBeenCalledWith('n.txt', true);
    fireEvent.click(screen.getByRole('button', { name: '丟棄變更：u.txt' }));
    expect(cb.onDiscard).toHaveBeenCalledWith('u.txt', false);
    fireEvent.click(screen.getByRole('button', { name: '標記為已解決：c.txt' }));
    expect(cb.onStage).toHaveBeenCalledWith('c.txt');
    fireEvent.click(screen.getByRole('button', { name: 'n.txt' }));
    expect(cb.onDiff).toHaveBeenCalledWith('n.txt', 'untracked');
    fireEvent.click(screen.getByRole('button', { name: 's.txt' }));
    expect(cb.onDiff).toHaveBeenCalledWith('s.txt', 'staged');
    fireEvent.click(screen.getByRole('button', { name: 'u.txt' }));
    expect(cb.onDiff).toHaveBeenCalledWith('u.txt', 'unstaged');
    fireEvent.click(screen.getByRole('button', { name: '全部加入' }));
    expect(cb.onStageAll).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '全部取消' }));
    expect(cb.onUnstageAll).toHaveBeenCalled();
  });

  it('shows empty hints, disables bulk buttons and forwards commits', () => {
    const cb = callbacks();
    render(<Host status={status([])} busy={false} {...cb} />);
    expect(screen.queryByText(/衝突（/)).not.toBeInTheDocument();
    expect(screen.getByText('沒有已暫存的變更')).toBeInTheDocument();
    expect(screen.getByText('工作目錄沒有變更')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '全部加入' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '全部取消' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('commit 訊息'), { target: { value: 'msg' } });
    fireEvent.click(screen.getByLabelText('修改上一次提交'));
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    expect(cb.onCommit).toHaveBeenCalledWith('msg', true);
  });

  // 訊息由上層保管：ChangesTab 只負責傳遞，清空與否也由上層決定
  it('mirrors the commit message handed down and clears it when the owner does', () => {
    const cb = callbacks();
    const onMessageChange = vi.fn();
    const props = { status: status([]), busy: false, amend: false, onMessageChange, onAmendChange: vi.fn(), ...cb };
    const { rerender } = render(<ChangesTab {...props} message="msg" />);
    expect(screen.getByLabelText('commit 訊息')).toHaveValue('msg');
    fireEvent.change(screen.getByLabelText('commit 訊息'), { target: { value: 'msg2' } });
    expect(onMessageChange).toHaveBeenCalledWith('msg2');
    rerender(<ChangesTab {...props} message="" />);
    expect(screen.getByLabelText('commit 訊息')).toHaveValue('');
  });
});
