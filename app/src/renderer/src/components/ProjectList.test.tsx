import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectList } from './ProjectList';
import type { ProjectInfo, PmState } from '../../../shared/types';

const projects: ProjectInfo[] = [
  { name: 'alpha', path: 'C:\\P\\alpha', initialized: true, state: null },
  { name: 'beta', path: 'C:\\P\\beta', initialized: false, state: null },
];

const none = new Set<string>();

describe('ProjectList', () => {
  it('renders projects, marks current, shows init badge, fires callbacks', () => {
    const onSelect = vi.fn(); const onInit = vi.fn(); const onNew = vi.fn(); const onInsights = vi.fn();
    render(<ProjectList projects={projects} currentPath={'C:\\P\\alpha'} livePaths={none} waitingPaths={none} onSelect={onSelect} onInit={onInit} onNew={onNew} onInsights={onInsights} onSkills={() => {}} onCloseSession={() => {}} />);
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
    render(<ProjectList projects={[]} currentPath={null} livePaths={none} waitingPaths={none} onSelect={() => {}} onInit={() => {}} onNew={() => {}} onInsights={() => {}} onSkills={() => {}} onCloseSession={() => {}} />);
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
    render(<ProjectList projects={[p]} currentPath={null} livePaths={none} waitingPaths={none} onSelect={() => {}} onInit={() => {}} onNew={() => {}} onInsights={() => {}} onSkills={() => {}} onCloseSession={() => {}} />);
    expect(screen.getByText(/產品設計/)).toHaveClass('pill', 'in_progress');
  });

  it('shows 已完成 for a finished project and 狀態異常 when state is broken', () => {
    const done: ProjectInfo = { name: 'delta', path: 'C:\\P\\delta', initialized: true, state: stateAt('done') };
    const broken: ProjectInfo = { name: 'eps', path: 'C:\\P\\eps', initialized: true, state: null, stateError: 'corrupt' };
    render(<ProjectList projects={[done, broken]} currentPath={null} livePaths={none} waitingPaths={none} onSelect={() => {}} onInit={() => {}} onNew={() => {}} onInsights={() => {}} onSkills={() => {}} onCloseSession={() => {}} />);
    expect(screen.getByText(/已完成/)).toHaveClass('pill', 'done');
    expect(screen.getByText(/狀態異常/)).toHaveClass('pill', 'blocked');
    expect(screen.queryByRole('button', { name: '初始化' })).toBeNull();
  });

  it('shows live and waiting pills and a close button for live sessions', () => {
    const a: ProjectInfo = { name: 'gamma', path: 'C:\\P\\gamma', initialized: true, state: stateAt('design') };
    const b: ProjectInfo = { name: 'delta', path: 'C:\\P\\delta', initialized: true, state: stateAt('design') };
    const onCloseSession = vi.fn();
    render(<ProjectList projects={[a, b]} currentPath={a.path} livePaths={new Set([a.path, b.path])} waitingPaths={new Set([b.path])} onSelect={() => {}} onInit={() => {}} onNew={() => {}} onInsights={() => {}} onSkills={() => {}} onCloseSession={onCloseSession} />);
    expect(screen.getByText('● 執行中').closest('.project')).toHaveTextContent('gamma');
    expect(screen.getByText('● 等待回覆').closest('.project')).toHaveTextContent('delta');
    expect(screen.getAllByRole('button', { name: '關閉 session' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: '關閉 session' })[1]!);
    expect(onCloseSession).toHaveBeenCalledWith(b);
  });

  it('closing a session does not also select the project', () => {
    const a: ProjectInfo = { name: 'gamma', path: 'C:\\P\\gamma', initialized: true, state: stateAt('design') };
    const onSelect = vi.fn();
    render(<ProjectList projects={[a]} currentPath={null} livePaths={new Set([a.path])} waitingPaths={none} onSelect={onSelect} onInit={() => {}} onNew={() => {}} onInsights={() => {}} onSkills={() => {}} onCloseSession={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '關閉 session' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows 未初始化, the waiting pill and a close button on an uninitialised live project', () => {
    const p: ProjectInfo = { name: 'zeta', path: 'C:\\P\\zeta', initialized: false, state: null };
    render(<ProjectList projects={[p]} currentPath={p.path} livePaths={new Set([p.path])} waitingPaths={new Set([p.path])} onSelect={() => {}} onInit={() => {}} onNew={() => {}} onInsights={() => {}} onSkills={() => {}} onCloseSession={() => {}} />);
    expect(screen.getByText('未初始化')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '初始化' })).toBeInTheDocument();
    expect(screen.getByText('● 等待回覆')).toHaveClass('pill', 'waiting');
    expect(screen.getByRole('button', { name: '關閉 session' })).toBeInTheDocument();
  });

  it('shows no live or waiting pill for a project without a session', () => {
    const a: ProjectInfo = { name: 'gamma', path: 'C:\\P\\gamma', initialized: true, state: stateAt('design') };
    render(<ProjectList projects={[a]} currentPath={a.path} livePaths={none} waitingPaths={none} onSelect={() => {}} onInit={() => {}} onNew={() => {}} onInsights={() => {}} onSkills={() => {}} onCloseSession={() => {}} />);
    expect(screen.queryByText('● 等待回覆')).toBeNull();
    expect(screen.queryByText('● 執行中')).toBeNull();
    expect(screen.queryByRole('button', { name: '關閉 session' })).toBeNull();
  });
});
