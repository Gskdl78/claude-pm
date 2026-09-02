import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HistoryTab } from './HistoryTab';

describe('HistoryTab', () => {
  it('renders commits as buttons, opens one on click or Enter, shows empty hint', () => {
    const onShow = vi.fn();
    const { rerender } = render(<HistoryTab commits={[{ hash: 'abc1234', date: '2026-09-02T10:00:00+08:00', message: 'chore: init project' }]} onShow={onShow} />);
    expect(screen.getByText('abc1234')).toBeInTheDocument();
    expect(screen.getByText('chore: init project')).toBeInTheDocument();
    const row = screen.getByRole('button', { name: /abc1234/ });
    fireEvent.click(row);
    expect(onShow).toHaveBeenCalledWith('abc1234');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onShow).toHaveBeenCalledTimes(2);
    rerender(<HistoryTab commits={[]} onShow={onShow} />);
    expect(screen.getByText('尚無 commit')).toBeInTheDocument();
  });
});
