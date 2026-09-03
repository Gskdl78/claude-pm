import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { StagePanel, FLASH_MS } from './StagePanel';
import type { ProjectInfo, PmState } from '../../../shared/types';

const project: ProjectInfo = {
  name: 'demo', path: 'C:\P\demo', initialized: true,
  state: {
    version: 1, name: 'demo', type: 'web', stage: 'design',
    stages: {
      env: { status: 'done', commit: 'abc1234', at: '2026-09-03T01:02:03.000Z' },
      design: { status: 'in_progress', docs: ['docs/product/prd.md'] },
      tech: { status: 'pending' }, build: { status: 'pending' }, verify: { status: 'pending' },
    },
    issues: [{ id: 1, stage: 'build', task: null, symptom: 's', cause: '', fix: '', commit: '', at: '' }],
  },
};

function withState(patch: Partial<PmState>, stages?: Partial<PmState['stages']>): ProjectInfo {
  const s = project.state!;
  return { ...project, state: { ...s, ...patch, stages: { ...s.stages, ...(stages ?? {}) } } };
}

const noop = () => {};
function renderPanel(p: ProjectInfo | null, over: Partial<{ canRun: boolean; flashSeq: number; onRunStage: (s: string) => void }> = {}) {
  return render(
    <StagePanel project={p} canRun={over.canRun ?? true} flashSeq={over.flashSeq ?? 0}
      onRebuild={noop} onOpenDoc={noop} onRunStage={over.onRunStage ?? noop} />,
  );
}

afterEach(() => { vi.useRealTimers(); });

describe('StagePanel', () => {
  it('renders five chips with status classes, current docs and issue count', () => {
    const onOpenDoc = vi.fn();
    render(<StagePanel project={project} canRun flashSeq={0} onRebuild={noop} onOpenDoc={onOpenDoc} onRunStage={noop} />);
    expect(screen.getByText('環境搭建').closest('.chip')).toHaveClass('done');
    expect(screen.getByRole('button', { name: /產品設計/ })).toHaveClass('chip', 'in_progress', 'current');
    expect(screen.getByText('技術設計').closest('.chip')).toHaveClass('pending');
    fireEvent.click(screen.getByRole('button', { name: 'docs/product/prd.md' }));
    expect(onOpenDoc).toHaveBeenCalledWith('docs/product/prd.md');
    expect(screen.getByText(/issue：1/)).toBeInTheDocument();
  });

  it('current stage is a button labelled 繼續 that sends the stage', () => {
    const onRunStage = vi.fn();
    renderPanel(project, { onRunStage });
    const btn = screen.getByRole('button', { name: /產品設計/ });
    expect(btn).toHaveTextContent('繼續');
    fireEvent.click(btn);
    expect(onRunStage).toHaveBeenCalledWith('design');
  });

  it('pending current stage says 開始 and blocked says 重跑 with its reason', () => {
    renderPanel(withState({ stage: 'tech' }, { design: { status: 'done', commit: 'def5678' } }));
    expect(screen.getByRole('button', { name: /技術設計/ })).toHaveTextContent('開始');

    const { unmount } = renderPanel(withState({}, { design: { status: 'blocked', reason: '缺少 PRD 確認' } }));
    expect(screen.getByRole('button', { name: /產品設計/ })).toHaveTextContent('重跑');
    expect(screen.getByText('缺少 PRD 確認')).toHaveClass('reason');
    unmount();
  });

  it('disables the stage button while claude is busy', () => {
    const onRunStage = vi.fn();
    renderPanel(project, { canRun: false, onRunStage });
    const btn = screen.getByRole('button', { name: /產品設計/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('title', 'Claude Code 執行中，請稍候');
    fireEvent.click(btn);
    expect(onRunStage).not.toHaveBeenCalled();
  });

  it('done chips carry commit and time in their title; other stages are not buttons', () => {
    renderPanel(project);
    const env = screen.getByText('環境搭建').closest('.chip')!;
    expect(env.tagName).toBe('SPAN');
    expect(env.getAttribute('title')).toMatch(/^commit abc1234 · /);
    expect(screen.getByText('技術設計').closest('.chip')!.tagName).toBe('SPAN');
  });

  it('shows no stage button once everything is done', () => {
    renderPanel(withState({ stage: 'done' }));
    expect(screen.queryByRole('button', { name: /環境搭建|產品設計|技術設計|產品實現|人工驗證/ })).toBeNull();
    expect(screen.getByText(/已完成/)).toBeInTheDocument();
  });

  it('flashes the stage row for FLASH_MS when flashSeq changes', () => {
    vi.useFakeTimers();
    const { rerender, container } = renderPanel(project, { flashSeq: 0 });
    const row = () => container.querySelector('.stages')!;
    expect(row()).not.toHaveClass('flash');
    rerender(<StagePanel project={project} canRun flashSeq={1} onRebuild={noop} onOpenDoc={noop} onRunStage={noop} />);
    expect(row()).toHaveClass('flash');
    act(() => { vi.advanceTimersByTime(FLASH_MS); });
    expect(row()).not.toHaveClass('flash');
  });

  it('offers rebuild when state is broken', () => {
    const onRebuild = vi.fn();
    render(<StagePanel project={{ ...project, state: null, stateError: 'corrupt' }} canRun flashSeq={0} onRebuild={onRebuild} onOpenDoc={noop} onRunStage={noop} />);
    expect(screen.getByText(/狀態未知/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重建 state' }));
    expect(onRebuild).toHaveBeenCalled();
  });

  it('shows placeholder without a project', () => {
    renderPanel(null);
    expect(screen.getByText('選擇或建立一個專案')).toBeInTheDocument();
  });
});
