import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing without a request', () => {
    const { container } = render(<ConfirmDialog request={null} onConfirm={() => {}} onCancel={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows description and the exact command, focuses confirm, cancels on Escape', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog request={{ title: '提交', description: '將已暫存的 2 個檔案提交', command: 'git commit -m "x"', danger: false }} onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByText('確認：提交')).toBeInTheDocument();
    expect(screen.getByText('將已暫存的 2 個檔案提交')).toBeInTheDocument();
    expect(screen.getByText('git commit -m "x"')).toBeInTheDocument();
    expect(screen.queryByText(/不容易復原/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確認' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('danger: shows the warning, red confirm label and focuses cancel', () => {
    render(<ConfirmDialog request={{ title: '丟棄', description: 'x', command: 'git clean -fd -- a', danger: true }} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('⚠ 此操作不容易復原，請再次確認！')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '我了解風險，執行' })).toHaveClass('danger-btn');
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
  });
});
