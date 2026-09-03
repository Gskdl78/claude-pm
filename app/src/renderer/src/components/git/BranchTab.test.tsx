import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BranchTab } from './BranchTab';
import type { GitBranches, GitStatus } from '../../../../shared/types';

interface HostProps {
  status: GitStatus;
  branches: GitBranches;
  busy: boolean;
  onSwitch: (b: string) => void;
  onCreate: (b: string) => void;
  onMerge: (b: string) => void;
}

/** 新分支名稱由 GitPanel 保管，測試用這個小殼提供狀態。 */
function Host(props: HostProps) {
  const [name, setName] = useState('');
  return <BranchTab {...props} name={name} onNameChange={setName} />;
}

const st = (over: Partial<GitStatus> = {}): GitStatus => ({
  isRepo: true, branch: 'main', detached: false, noCommits: false, upstream: 'origin/main',
  ahead: 0, behind: 0, hasRemote: true, merging: false, files: [], ...over,
});
const cbs = () => ({ onSwitch: vi.fn(), onCreate: vi.fn(), onMerge: vi.fn() });

describe('BranchTab', () => {
  it('switches, validates new names and merges from the first other branch by default', () => {
    const cb = cbs();
    render(<Host status={st()} branches={{ current: 'main', all: ['dev', 'hotfix', 'main'] }} busy={false} {...cb} />);
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('→ origin/main')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('切換到'), { target: { value: 'hotfix' } });
    fireEvent.click(screen.getByRole('button', { name: '切換' }));
    expect(cb.onSwitch).toHaveBeenCalledWith('hotfix');

    const input = screen.getByLabelText('新分支名稱');
    const create = screen.getByRole('button', { name: '新增' });
    expect(create).toBeDisabled();
    fireEvent.change(input, { target: { value: 'bad name' } });
    expect(create).toBeDisabled();
    expect(screen.getByText(/名稱不合法/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'dev' } });
    expect(screen.getByText('分支已存在')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'feature/x' } });
    expect(create).toBeEnabled();
    fireEvent.click(create);
    expect(cb.onCreate).toHaveBeenCalledWith('feature/x');
    expect(input).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: '合併' }));
    expect(cb.onMerge).toHaveBeenCalledWith('dev');
    fireEvent.change(screen.getByLabelText('合併來源'), { target: { value: 'hotfix' } });
    fireEvent.click(screen.getByRole('button', { name: '合併' }));
    expect(cb.onMerge).toHaveBeenLastCalledWith('hotfix');
  });

  it('disables switch and merge without other branches, merge while merging, shows detached HEAD', () => {
    const cb = cbs();
    const { rerender } = render(<Host status={st({ merging: true })} branches={{ current: 'main', all: ['dev', 'main'] }} busy={false} {...cb} />);
    expect(screen.getByRole('button', { name: '合併' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '切換' })).toBeEnabled();
    rerender(<Host status={st({ upstream: null })} branches={{ current: 'main', all: ['main'] }} busy={false} {...cb} />);
    expect(screen.getByRole('button', { name: '切換' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '合併' })).toBeDisabled();
    expect(screen.getByText('沒有其他分支')).toBeInTheDocument();
    rerender(<Host status={st({ detached: true, branch: 'HEAD' })} branches={{ current: '', all: ['main'] }} busy={false} {...cb} />);
    expect(screen.getByText('HEAD（未在任何分支上）')).toBeInTheDocument();
  });
});
