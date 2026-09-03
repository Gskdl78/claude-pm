import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiffView } from './DiffView';

describe('DiffView', () => {
  it('colours lines by prefix, shows an empty hint and closes on Escape', () => {
    const onClose = vi.fn();
    const text = 'diff --git a/a.txt b/a.txt\n@@ -1 +1 @@\n-one\n+two\n context';
    const { rerender } = render(<DiffView title="差異：a.txt" text={text} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: '差異：a.txt' })).toBeInTheDocument();
    expect(screen.getByText('diff --git a/a.txt b/a.txt')).toHaveClass('meta');
    expect(screen.getByText('@@ -1 +1 @@')).toHaveClass('hunk');
    expect(screen.getByText('-one')).toHaveClass('del');
    expect(screen.getByText('+two')).toHaveClass('add');
    expect(screen.getByRole('button', { name: '關閉' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    rerender(<DiffView title="差異：b.txt" text="" onClose={onClose} />);
    expect(screen.getByText('（沒有差異內容）')).toBeInTheDocument();
  });
});

const TWO_HUNKS = [
  'diff --git a/a.txt b/a.txt', 'index 1111111..2222222 100644', '--- a/a.txt', '+++ b/a.txt',
  '@@ -1,2 +1,3 @@', ' one', '+added', ' two',
  '@@ -10,2 +11,2 @@', '-old', '+new', ' tail',
].join('\n') + '\n';

describe('DiffView hunk buttons', () => {
  it('offers 暫存此段 per hunk for an unstaged diff and reports the hunk index', () => {
    const onHunk = vi.fn();
    render(<DiffView title="差異：a.txt" text={TWO_HUNKS} mode="unstaged" onHunk={onHunk} onClose={() => {}} />);
    const buttons = screen.getAllByRole('button', { name: '暫存此段' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]!);
    expect(onHunk).toHaveBeenCalledWith(1);
    expect(screen.getByText('@@ -10,2 +11,2 @@')).toBeInTheDocument();
    expect(screen.getByText('+new')).toHaveClass('add');
  });

  it('offers 取消暫存此段 for a staged diff and disables the buttons while busy', () => {
    const { rerender } = render(<DiffView title="差異：a.txt" text={TWO_HUNKS} mode="staged" onHunk={() => {}} onClose={() => {}} />);
    expect(screen.getAllByRole('button', { name: '取消暫存此段' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: '暫存此段' })).not.toBeInTheDocument();
    rerender(<DiffView title="差異：a.txt" text={TWO_HUNKS} mode="staged" busy onHunk={() => {}} onClose={() => {}} />);
    for (const b of screen.getAllByRole('button', { name: '取消暫存此段' })) expect(b).toBeDisabled();
  });

  it('hides hunk buttons for untracked, binary and truncated diffs, explaining the truncated case', () => {
    const { rerender } = render(<DiffView title="差異：n.txt" text={'（新檔案）\nhello'} mode="untracked" onHunk={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /此段/ })).not.toBeInTheDocument();
    rerender(<DiffView title="差異：b.bin" text={'diff --git a/b.bin b/b.bin\nBinary files a/b.bin and b/b.bin differ\n'} mode="unstaged" onHunk={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /此段/ })).not.toBeInTheDocument();
    expect(screen.queryByText('差異過長，無法逐段暫存')).not.toBeInTheDocument();
    rerender(<DiffView title="差異：a.txt" text={TWO_HUNKS + '\n…（內容過長，已截斷）'} mode="unstaged" onHunk={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /此段/ })).not.toBeInTheDocument();
    expect(screen.getByText('差異過長，無法逐段暫存')).toBeInTheDocument();
    // 沒有 onHunk（例如顯示提交內容）就沒有按鈕
    rerender(<DiffView title="提交：abc1234" text={TWO_HUNKS} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /此段/ })).not.toBeInTheDocument();
  });
});
