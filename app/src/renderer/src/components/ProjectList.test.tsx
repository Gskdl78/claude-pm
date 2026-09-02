import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectList } from './ProjectList';
import type { ProjectInfo } from '../../../shared/types';

const projects: ProjectInfo[] = [
  { name: 'alpha', path: 'C:\\P\\alpha', initialized: true, state: null },
  { name: 'beta', path: 'C:\\P\\beta', initialized: false, state: null },
];

describe('ProjectList', () => {
  it('renders projects, marks current, shows init badge, fires callbacks', () => {
    const onSelect = vi.fn(); const onInit = vi.fn(); const onNew = vi.fn();
    render(<ProjectList projects={projects} currentPath={'C:\\P\\alpha'} onSelect={onSelect} onInit={onInit} onNew={onNew} />);
    expect(screen.getByText('alpha').closest('.project')).toHaveClass('active');
    expect(screen.getByText('未初始化')).toBeInTheDocument();
    fireEvent.click(screen.getByText('beta'));
    expect(onSelect).toHaveBeenCalledWith(projects[1]);
    fireEvent.click(screen.getByRole('button', { name: '初始化' }));
    expect(onInit).toHaveBeenCalledWith(projects[1]);
    fireEvent.click(screen.getByRole('button', { name: '+ 新專案' }));
    expect(onNew).toHaveBeenCalled();
  });

  it('shows empty hint', () => {
    render(<ProjectList projects={[]} currentPath={null} onSelect={() => {}} onInit={() => {}} onNew={() => {}} />);
    expect(screen.getByText('尚無專案')).toBeInTheDocument();
  });
});
