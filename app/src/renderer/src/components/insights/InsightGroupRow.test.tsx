import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InsightGroupRow } from './InsightGroupRow';
import type { InsightGroup } from '../../../../shared/types';

const group: InsightGroup = {
  key: 'env 缺少 .env', cause: 'Env 缺少 .env', count: 2, projects: ['a', 'b'], fixes: ['加 .env.example', '文件說明'],
  items: [
    { id: 1, stage: 'build', task: 'T1', symptom: '啟動失敗', cause: 'Env 缺少 .env', fix: '加 .env.example', commit: 'abc1234', at: '2026-09-01T00:00:00Z', project: 'a', path: 'C:\\P\\a' },
    { id: 2, stage: 'verify', task: null, symptom: '登入失敗', cause: 'Env 缺少 .env', fix: '文件說明', commit: '', at: '2026-08-01T00:00:00Z', project: 'b', path: 'C:\\P\\b' },
  ],
};

describe('InsightGroupRow', () => {
  it('shows cause, count, projects and fixes; expands to items; reveals commits', () => {
    const onToggle = vi.fn(); const onPin = vi.fn(); const onRevealCommit = vi.fn();
    const { rerender } = render(<InsightGroupRow group={group} expanded={false} pinned={false} busy={false} onToggle={onToggle} onPin={onPin} onRevealCommit={onRevealCommit} />);
    expect(screen.getByText('Env 缺少 .env')).toBeInTheDocument();
    expect(screen.getByText('2 次')).toBeInTheDocument();
    expect(screen.getByText('a')).toHaveClass('pill');
    expect(screen.getByText(/加 \.env\.example/)).toBeInTheDocument();
    expect(screen.queryByText('啟動失敗')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '展開' }));
    expect(onToggle).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '釘選為注意事項' }));
    expect(onPin).toHaveBeenCalled();

    rerender(<InsightGroupRow group={group} expanded pinned busy={false} onToggle={onToggle} onPin={onPin} onRevealCommit={onRevealCommit} />);
    expect(screen.getByText('啟動失敗')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已釘選' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '查看 commit abc1234' }));
    expect(onRevealCommit).toHaveBeenCalledWith('C:\\P\\a', 'abc1234');
    expect(screen.getByRole('button', { name: '無 commit' })).toBeDisabled();
  });

  it('disables pinning when the group has no fix', () => {
    const onPin = vi.fn();
    render(<InsightGroupRow group={{ ...group, fixes: [] }} expanded={false} pinned={false} busy={false}
      onToggle={() => {}} onPin={onPin} onRevealCommit={() => {}} />);
    const btn = screen.getByRole('button', { name: '釘選為注意事項' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', '沒有修法可釘選');
  });
});
