import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionLimitDialog } from './SessionLimitDialog';
import type { ProjectInfo } from '../../../shared/types';

describe('SessionLimitDialog', () => {
  it('lists live sessions and closes one; cancel dismisses', () => {
    const onClose = vi.fn(); const onCancel = vi.fn();
    const pending: ProjectInfo = { name: 'new', path: 'C:\\P\\new', initialized: true, state: null };
    render(<SessionLimitDialog pending={pending} live={[{ path: 'C:\\P\\a', name: 'a' }, { path: 'C:\\P\\b', name: 'b' }]} busy={false} onClose={onClose} onCancel={onCancel} />);
    expect(screen.getByText(/同時開啟的 session 已達上限（4）/)).toBeInTheDocument();
    expect(screen.getByText(/要開啟 new/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '關閉' })[1]!);
    expect(onClose).toHaveBeenCalledWith('C:\\P\\b');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables every action while a session is being closed', () => {
    const onClose = vi.fn(); const onCancel = vi.fn();
    const pending: ProjectInfo = { name: 'new', path: 'C:\\P\\new', initialized: true, state: null };
    render(<SessionLimitDialog pending={pending} live={[{ path: 'C:\\P\\a', name: 'a' }]} busy onClose={onClose} onCancel={onCancel} />);
    expect(screen.getByRole('button', { name: '關閉' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('renders nothing without a pending project', () => {
    const { container } = render(<SessionLimitDialog pending={null} live={[]} busy={false} onClose={() => {}} onCancel={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
