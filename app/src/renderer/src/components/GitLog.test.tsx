import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GitLog } from './GitLog';

describe('GitLog', () => {
  it('renders commits and empty hint', () => {
    const { rerender } = render(<GitLog commits={[{ hash: 'abc1234', date: '2026-09-02T10:00:00+08:00', message: 'chore: init project' }]} />);
    expect(screen.getByText('abc1234')).toBeInTheDocument();
    expect(screen.getByText('chore: init project')).toBeInTheDocument();
    rerender(<GitLog commits={[]} />);
    expect(screen.getByText('尚無 commit')).toBeInTheDocument();
  });
});
