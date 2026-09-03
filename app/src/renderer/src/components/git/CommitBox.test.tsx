import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommitBox } from './CommitBox';
import { COMMIT_PREFIXES } from '../../../../shared/commit-prefix';

/** CommitBox 的輸入由上層保管，測試用這個小殼提供狀態。 */
function Host(props: { busy: boolean; stagedCount: number; noCommits: boolean; onCommit: (m: string, a: boolean) => void }) {
  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);
  return <CommitBox {...props} stage={null} message={message} amend={amend} onMessageChange={setMessage} onAmendChange={setAmend} />;
}

describe('CommitBox', () => {
  it('enables commit only with a message and staged files, supports amend and Ctrl+Enter', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<Host busy={false} stagedCount={0} noCommits={false} onCommit={onCommit} />);
    const btn = screen.getByRole('button', { name: '提交' });
    expect(btn).toBeDisabled();
    expect(screen.getByText('請先輸入 commit 訊息')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('commit 訊息'), { target: { value: '  feat: x  ' } });
    expect(btn).toBeDisabled();
    expect(screen.getByText('還沒有已暫存的變更')).toBeInTheDocument();
    rerender(<Host busy={false} stagedCount={2} noCommits={false} onCommit={onCommit} />);
    expect(btn).toBeEnabled();
    fireEvent.keyDown(screen.getByLabelText('commit 訊息'), { key: 'Enter', ctrlKey: true });
    expect(onCommit).toHaveBeenCalledWith('feat: x', false);
    fireEvent.click(screen.getByLabelText('修改上一次提交'));
    fireEvent.click(btn);
    expect(onCommit).toHaveBeenLastCalledWith('feat: x', true);
  });

  it('allows a message-only amend and disables amend before the first commit', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<Host busy={false} stagedCount={0} noCommits={false} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('commit 訊息'), { target: { value: 'fix wording' } });
    fireEvent.click(screen.getByLabelText('修改上一次提交'));
    expect(screen.getByRole('button', { name: '提交' })).toBeEnabled();
    rerender(<Host busy={false} stagedCount={0} noCommits={true} onCommit={onCommit} />);
    expect(screen.getByLabelText('修改上一次提交')).toBeDisabled();
    rerender(<Host busy={true} stagedCount={3} noCommits={false} onCommit={onCommit} />);
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
  });

  it('shows the message and amend flag handed down from above', () => {
    const onCommit = vi.fn();
    const onMessageChange = vi.fn();
    const onAmendChange = vi.fn();
    render(<CommitBox busy={false} stagedCount={1} noCommits={false} stage={null} message="feat: kept" amend
      onMessageChange={onMessageChange} onAmendChange={onAmendChange} onCommit={onCommit} />);
    expect(screen.getByLabelText('commit 訊息')).toHaveValue('feat: kept');
    expect(screen.getByLabelText('修改上一次提交')).toBeChecked();
    fireEvent.change(screen.getByLabelText('commit 訊息'), { target: { value: 'feat: typed' } });
    expect(onMessageChange).toHaveBeenCalledWith('feat: typed');
    fireEvent.click(screen.getByLabelText('修改上一次提交'));
    expect(onAmendChange).toHaveBeenCalledWith(false);
  });
});

describe('CommitBox prefix row', () => {
  it('highlights the prefix of the current stage and inserts or replaces a prefix on click', () => {
    const onMessageChange = vi.fn();
    const { rerender } = render(<CommitBox busy={false} stagedCount={1} noCommits={false} stage="design" message="update prd"
      amend={false} onMessageChange={onMessageChange} onAmendChange={() => {}} onCommit={() => {}} />);
    expect(screen.getByRole('button', { name: 'docs(design):' })).toHaveClass('primary');
    expect(screen.getByRole('button', { name: 'feat:' })).not.toHaveClass('primary');
    fireEvent.click(screen.getByRole('button', { name: 'fix:' }));
    expect(onMessageChange).toHaveBeenCalledWith('fix: update prd');

    rerender(<CommitBox busy={false} stagedCount={1} noCommits={false} stage="build" message="feat: add login"
      amend={false} onMessageChange={onMessageChange} onAmendChange={() => {}} onCommit={() => {}} />);
    expect(screen.getByRole('button', { name: 'feat:' })).toHaveClass('primary');
    fireEvent.click(screen.getByRole('button', { name: 'test:' }));
    expect(onMessageChange).toHaveBeenLastCalledWith('test: add login');

    // 沒有 state（stage 為 null）：不高亮任何前綴，但按鈕仍可用
    rerender(<CommitBox busy={false} stagedCount={1} noCommits={false} stage={null} message=""
      amend={false} onMessageChange={onMessageChange} onAmendChange={() => {}} onCommit={() => {}} />);
    for (const p of COMMIT_PREFIXES) expect(screen.getByRole('button', { name: p.trim() })).not.toHaveClass('primary');

    rerender(<CommitBox busy stagedCount={1} noCommits={false} stage="build" message=""
      amend={false} onMessageChange={onMessageChange} onAmendChange={() => {}} onCommit={() => {}} />);
    expect(screen.getByRole('button', { name: 'feat:' })).toHaveClass('primary');
    expect(screen.getByRole('button', { name: 'feat:' })).toBeDisabled();
  });
});
