import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectList } from './ProjectList';
import type { ProjectInfo, PmState } from '../../../shared/types';

const projects: ProjectInfo[] = [
  { name: 'alpha', path: 'C:\\P\\alpha', initialized: true, state: null },
  { name: 'beta', path: 'C:\\P\\beta', initialized: false, state: null },
];

describe('ProjectList', () => {
  it('renders projects, marks current, shows init badge, fires callbacks', () => {
    const onSelect = vi.fn(); const onInit = vi.fn(); const onNew = vi.fn(); const onInsights = vi.fn();
    render(<ProjectList projects={projects} currentPath={'C:\\P\\alpha'} onSelect={onSelect} onInit={onInit} onNew={onNew} onInsights={onInsights} />);
    expect(screen.getByText('alpha').closest('.project')).toHaveClass('active');
    expect(screen.getByText('未初始化')).toBeInTheDocument();
    fireEvent.click(screen.getByText('beta'));
    expect(onSelect).toHaveBeenCalledWith(projects[1]);
    fireEvent.click(screen.getByRole('button', { name: '初始化' }));
    expect(onInit).toHaveBeenCalledWith(projects[1]);
    fireEvent.click(screen.getByRole('button', { name: '+ 新專案' }));
    expect(onNew).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '📊 洞察' }));
    expect(onInsights).toHaveBeenCalled();
  });

  it('shows empty hint', () => {
    render(<ProjectList projects={[]} currentPath={null} onSelect={() => {}} onInit={() => {}} onNew={() => {}} onInsights={() => {}} />);
    expect(screen.getByText('尚無專案')).toBeInTheDocument();
  });
});

function stateAt(stage: PmState['stage']): PmState {
  return {
    version: 1, name: 'gamma', type: 'web', stage,
    stages: {
      env: { status: 'done' }, design: { status: 'in_progress' },
      tech: { status: 'pending' }, build: { status: 'pending' }, verify: { status: 'pending' },
    },
    issues: [],
  };
}

describe('ProjectList stage pill', () => {
  it('shows the current stage label with its status class', () => {
    const p: ProjectInfo = { name: 'gamma', path: 'C:\\P\\gamma', initialized: true, state: stateAt('design') };
    render(<ProjectList projects={[p]} currentPath={null} onSelect={() => {}} onInit={() => {}} onNew={() => {}} onInsights={() => {}} />);
    expect(screen.getByText(/產品設計/)).toHaveClass('pill', 'in_progress');
  });

  it('shows 已完成 for a finished project and 狀態異常 when state is broken', () => {
    const done: ProjectInfo = { name: 'delta', path: 'C:\\P\\delta', initialized: true, state: stateAt('done') };
    const broken: ProjectInfo = { name: 'eps', path: 'C:\\P\\eps', initialized: true, state: null, stateError: 'corrupt' };
    render(<ProjectList projects={[done, broken]} currentPath={null} onSelect={() => {}} onInit={() => {}} onNew={() => {}} onInsights={() => {}} />);
    expect(screen.getByText(/已完成/)).toHaveClass('pill', 'done');
    expect(screen.getByText(/狀態異常/)).toHaveClass('pill', 'blocked');
    expect(screen.queryByRole('button', { name: '初始化' })).toBeNull();
  });

  it('shows a waiting pill only on the project matching waitingPath', () => {
    const a: ProjectInfo = { name: 'gamma', path: 'C:\\P\\gamma', initialized: true, state: stateAt('design') };
    const b: ProjectInfo = { name: 'delta', path: 'C:\\P\\delta', initialized: true, state: stateAt('design') };
    render(<ProjectList projects={[a, b]} currentPath={a.path} waitingPath={a.path} onSelect={() => {}} onInit={() => {}} onNew={() => {}} onInsights={() => {}} />);
    const pills = screen.getAllByText('● 等待回覆');
    expect(pills).toHaveLength(1);
    expect(pills[0]).toHaveClass('pill', 'waiting');
    expect(pills[0].closest('.project')).toHaveTextContent('gamma');
  });

  it('shows both 未初始化 and the waiting pill on an uninitialised current project', () => {
    const p: ProjectInfo = { name: 'zeta', path: 'C:\\P\\zeta', initialized: false, state: null };
    render(<ProjectList projects={[p]} currentPath={p.path} waitingPath={p.path} onSelect={() => {}} onInit={() => {}} onNew={() => {}} onInsights={() => {}} />);
    expect(screen.getByText('未初始化')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '初始化' })).toBeInTheDocument();
    expect(screen.getByText('● 等待回覆')).toHaveClass('pill', 'waiting');
  });

  it('shows no waiting pill when waitingPath is null', () => {
    const a: ProjectInfo = { name: 'gamma', path: 'C:\\P\\gamma', initialized: true, state: stateAt('design') };
    render(<ProjectList projects={[a]} currentPath={a.path} waitingPath={null} onSelect={() => {}} onInit={() => {}} onNew={() => {}} onInsights={() => {}} />);
    expect(screen.queryByText('● 等待回覆')).toBeNull();
  });
});
