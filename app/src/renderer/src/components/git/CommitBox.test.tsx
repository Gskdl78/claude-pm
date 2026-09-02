import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommitBox } from './CommitBox';

describe('CommitBox', () => {
  it('enables commit only with a message and staged files, supports amend and Ctrl+Enter', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<CommitBox busy={false} stagedCount={0} noCommits={false} onCommit={onCommit} />);
    const btn = screen.getByRole('button', { name: '提交' });
    expect(btn).toBeDisabled();
    expect(screen.getByText('請先輸入 commit 訊息')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('commit 訊息'), { target: { value: '  feat: x  ' } });
    expect(btn).toBeDisabled();
    expect(screen.getByText('還沒有已暫存的變更')).toBeInTheDocument();
    rerender(<CommitBox busy={false} stagedCount={2} noCommits={false} onCommit={onCommit} />);
    expect(btn).toBeEnabled();
    fireEvent.keyDown(screen.getByLabelText('commit 訊息'), { key: 'Enter', ctrlKey: true });
    expect(onCommit).toHaveBeenCalledWith('feat: x', false);
    fireEvent.click(screen.getByLabelText('修改上一次提交'));
    fireEvent.click(btn);
    expect(onCommit).toHaveBeenLastCalledWith('feat: x', true);
  });

  it('allows a message-only amend and disables amend before the first commit', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<CommitBox busy={false} stagedCount={0} noCommits={false} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('commit 訊息'), { target: { value: 'fix wording' } });
    fireEvent.click(screen.getByLabelText('修改上一次提交'));
    expect(screen.getByRole('button', { name: '提交' })).toBeEnabled();
    rerender(<CommitBox busy={false} stagedCount={0} noCommits={true} onCommit={onCommit} />);
    expect(screen.getByLabelText('修改上一次提交')).toBeDisabled();
    rerender(<CommitBox busy={true} stagedCount={3} noCommits={false} onCommit={onCommit} />);
    expect(screen.getByRole('button', { name: '提交' })).toBeDisabled();
  });
});
