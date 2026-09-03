import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotRepo } from './NotRepo';

describe('NotRepo', () => {
  it('explains the state and triggers init', () => {
    const onInit = vi.fn();
    const { rerender } = render(<NotRepo busy={false} onInit={onInit} />);
    expect(screen.getByText('這個資料夾還不是 git 專案')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '初始化' }));
    expect(onInit).toHaveBeenCalledTimes(1);
    rerender(<NotRepo busy={true} onInit={onInit} />);
    expect(screen.getByRole('button', { name: '初始化' })).toBeDisabled();
  });
});
