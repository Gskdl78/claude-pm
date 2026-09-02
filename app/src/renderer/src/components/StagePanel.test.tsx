import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StagePanel } from './StagePanel';
import type { ProjectInfo } from '../../../shared/types';

const project: ProjectInfo = {
  name: 'demo', path: 'C:\\P\\demo', initialized: true,
  state: {
    version: 1, name: 'demo', type: 'web', stage: 'design',
    stages: {
      env: { status: 'done', commit: 'abc1234' },
      design: { status: 'in_progress', docs: ['docs/product/prd.md'] },
      tech: { status: 'pending' }, build: { status: 'pending' }, verify: { status: 'pending' },
    },
    issues: [{ id: 1, stage: 'build', task: null, symptom: 's', cause: '', fix: '', commit: '', at: '' }],
  },
};

describe('StagePanel', () => {
  it('renders five chips with status classes, current docs and issue count', () => {
    const onOpenDoc = vi.fn();
    render(<StagePanel project={project} onRebuild={() => {}} onOpenDoc={onOpenDoc} />);
    expect(screen.getByText('環境搭建')).toHaveClass('done');
    expect(screen.getByText('產品設計')).toHaveClass('in_progress');
    expect(screen.getByText('技術設計')).toHaveClass('pending');
    fireEvent.click(screen.getByRole('button', { name: 'docs/product/prd.md' }));
    expect(onOpenDoc).toHaveBeenCalledWith('docs/product/prd.md');
    expect(screen.getByText(/issue：1/)).toBeInTheDocument();
  });

  it('offers rebuild when state is broken', () => {
    const onRebuild = vi.fn();
    render(<StagePanel project={{ ...project, state: null, stateError: 'corrupt' }} onRebuild={onRebuild} onOpenDoc={() => {}} />);
    expect(screen.getByText(/狀態未知/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重建 state' }));
    expect(onRebuild).toHaveBeenCalled();
  });

  it('shows placeholder without a project', () => {
    render(<StagePanel project={null} onRebuild={() => {}} onOpenDoc={() => {}} />);
    expect(screen.getByText('選擇或建立一個專案')).toBeInTheDocument();
  });
});
