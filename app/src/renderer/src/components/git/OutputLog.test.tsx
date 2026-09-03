import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OutputLog } from './OutputLog';

describe('OutputLog', () => {
  it('shows an empty hint, then entries with kind classes and details', () => {
    const { rerender } = render(<OutputLog entries={[]} />);
    expect(screen.getByText('尚未執行任何操作')).toBeInTheDocument();
    rerender(<OutputLog entries={[
      { id: 1, kind: 'cmd', text: 'git add -- a' },
      { id: 2, kind: 'ok', text: '完成 ✓' },
      { id: 3, kind: 'error', text: '推送被拒', detail: '! [rejected]' },
      { id: 4, kind: 'hint', text: '尚未設定遠端倉庫' },
    ]} />);
    expect(screen.getByText('> git add -- a').closest('.out')).toHaveClass('cmd');
    expect(screen.getByText('完成 ✓').closest('.out')).toHaveClass('ok');
    expect(screen.getByText('推送被拒').closest('.out')).toHaveClass('error');
    expect(screen.getByText('! [rejected]')).toBeInTheDocument();
    expect(screen.getByText('尚未設定遠端倉庫').closest('.out')).toHaveClass('hint');
    expect(screen.queryByText('尚未執行任何操作')).not.toBeInTheDocument();
  });
});
