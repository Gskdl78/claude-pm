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
