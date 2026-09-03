import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HistoryTab } from './HistoryTab';

const commits = [{ hash: 'abc1234', date: '2026-09-02T10:00:00+08:00', message: 'chore: init project' }];
const cbs = () => ({ onShow: vi.fn(), onRevert: vi.fn(), onResetTo: vi.fn(), onTag: vi.fn() });

describe('HistoryTab', () => {
  it('renders commits as buttons, opens one on click or Enter, shows empty hint', () => {
    const cb = cbs();
    const { rerender } = render(<HistoryTab commits={commits} busy={false} {...cb} />);
    expect(screen.getByText('abc1234')).toBeInTheDocument();
    expect(screen.getByText('chore: init project')).toBeInTheDocument();
    const row = screen.getByRole('button', { name: '查看提交：abc1234' });
    fireEvent.click(row);
    expect(cb.onShow).toHaveBeenCalledWith('abc1234');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(cb.onShow).toHaveBeenCalledTimes(2);
    rerender(<HistoryTab commits={[]} busy={false} {...cb} />);
    expect(screen.getByText('尚無 commit')).toBeInTheDocument();
  });

  it('offers revert / reset-to-here / tag per commit without opening the commit', () => {
    const cb = cbs();
    const { rerender } = render(<HistoryTab commits={commits} busy={false} {...cb} />);
    fireEvent.click(screen.getByRole('button', { name: '還原提交：abc1234' }));
    expect(cb.onRevert).toHaveBeenCalledWith('abc1234');
    fireEvent.click(screen.getByRole('button', { name: '重設到此：abc1234' }));
    expect(cb.onResetTo).toHaveBeenCalledWith('abc1234');
    fireEvent.click(screen.getByRole('button', { name: '在此建立標籤：abc1234' }));
    expect(cb.onTag).toHaveBeenCalledWith('abc1234');
    expect(cb.onShow).not.toHaveBeenCalled();
    rerender(<HistoryTab commits={commits} busy={true} {...cb} />);
    expect(screen.getByRole('button', { name: '還原提交：abc1234' })).toBeDisabled();
  });
});
