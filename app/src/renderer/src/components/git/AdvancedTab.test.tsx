import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdvancedTab, EMPTY_ADVANCED_FORM, type AdvancedForm } from './AdvancedTab';
import type { GitExtras, GitStatus } from '../../../../shared/types';

const st = (over: Partial<GitStatus> = {}): GitStatus => ({
  isRepo: true, branch: 'main', detached: false, noCommits: false, upstream: null,
  ahead: 0, behind: 0, hasRemote: false, merging: false, files: [], ...over,
});
const changed = st({ files: [{ path: 'a.txt', index: ' ', work: 'M', staged: false, unstaged: true, untracked: false, conflicted: false }] });
const extras = (over: Partial<GitExtras> = {}): GitExtras => ({ stashes: [], tags: [], ...over });
const cbs = () => ({ onStash: vi.fn(), onStashPop: vi.fn(), onStashDrop: vi.fn(), onReset: vi.fn(), onTag: vi.fn(), onDeleteTag: vi.fn() });

type HostProps = Omit<Parameters<typeof AdvancedTab>[0], 'form' | 'onFormChange'> & { initial?: AdvancedForm };
/** 表單由 GitPanel 保管，測試用這個小殼提供狀態。 */
function Host({ initial = EMPTY_ADVANCED_FORM, ...props }: HostProps) {
  const [form, setForm] = useState(initial);
  return <AdvancedTab {...props} form={form} onFormChange={setForm} />;
}

describe('AdvancedTab', () => {
  it('stashes with an optional message and pops / drops listed stashes', () => {
    const cb = cbs();
    const { rerender } = render(<Host status={st()} extras={extras()} busy={false} {...cb} />);
    expect(screen.getByRole('button', { name: '收藏目前變更' })).toBeDisabled();
    expect(screen.getByText('工作目錄沒有變更可收藏')).toBeInTheDocument();
    expect(screen.getByText('沒有收藏的變更')).toBeInTheDocument();
    rerender(<Host status={changed} extras={extras({ stashes: [{ index: 0, message: 'On main: wip' }, { index: 1, message: 'WIP on main: 1a2b3c first' }] })} busy={false} {...cb} />);
    fireEvent.click(screen.getByRole('button', { name: '收藏目前變更' }));
    expect(cb.onStash).toHaveBeenCalledWith(null);
    fireEvent.change(screen.getByLabelText('收藏說明（選填）'), { target: { value: '  登入中 ' } });
    fireEvent.click(screen.getByRole('button', { name: '收藏目前變更' }));
    expect(cb.onStash).toHaveBeenLastCalledWith('登入中');
    expect(screen.getByText('stash@{1}')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取回收藏：stash@{0}' }));
    expect(cb.onStashPop).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole('button', { name: '丟棄收藏：stash@{1}' }));
    expect(cb.onStashDrop).toHaveBeenCalledWith(1);
  });

  it('resets to HEAD~n or a hash in the chosen mode and validates the target', () => {
    const cb = cbs();
    render(<Host status={st()} extras={extras()} busy={false} {...cb} />);
    expect(screen.getByLabelText('mixed')).toBeChecked();
    expect(screen.getByLabelText('重設目標')).toHaveValue('HEAD~1');
    fireEvent.click(screen.getByLabelText('hard'));
    fireEvent.change(screen.getByLabelText('重設目標'), { target: { value: 'HEAD~2' } });
    const btn = screen.getByRole('button', { name: '重設' });
    expect(btn).toHaveClass('danger-btn');
    fireEvent.click(btn);
    expect(cb.onReset).toHaveBeenCalledWith('hard', 'HEAD~2');
    fireEvent.change(screen.getByLabelText('重設目標'), { target: { value: 'main' } });
    expect(btn).toBeDisabled();
    expect(screen.getByText(/目標不合法/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('soft'));
    fireEvent.change(screen.getByLabelText('重設目標'), { target: { value: 'abc1234' } });
    expect(btn).not.toHaveClass('danger-btn');
    fireEvent.click(btn);
    expect(cb.onReset).toHaveBeenLastCalledWith('soft', 'abc1234');
  });

  it('creates tags on HEAD or a picked commit, validates names, deletes listed tags, locks without commits', () => {
    const cb = cbs();
    const { rerender } = render(<Host status={st()} extras={extras({ tags: ['v1'] })} busy={false} initial={{ ...EMPTY_ADVANCED_FORM, tagHash: 'abc1234' }} {...cb} />);
    const input = screen.getByLabelText('標籤名稱');
    const create = screen.getByRole('button', { name: '建立標籤' });
    expect(create).toBeDisabled();
    fireEvent.change(input, { target: { value: 'v1' } });
    expect(screen.getByText('標籤已存在')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'bad tag' } });
    expect(screen.getByText(/名稱不合法/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'v2' } });
    fireEvent.click(create);
    expect(cb.onTag).toHaveBeenCalledWith('v2', 'abc1234');
    fireEvent.click(screen.getByRole('button', { name: '改為目前提交' }));
    fireEvent.click(create);
    expect(cb.onTag).toHaveBeenLastCalledWith('v2', null);
    fireEvent.click(screen.getByRole('button', { name: '刪除標籤：v1' }));
    expect(cb.onDeleteTag).toHaveBeenCalledWith('v1');
    rerender(<Host status={st({ noCommits: true })} extras={extras()} busy={false} {...cb} />);
    expect(screen.getByRole('button', { name: '收藏目前變更' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重設' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '建立標籤' })).toBeDisabled();
    expect(screen.getByText(/還沒有任何提交/)).toBeInTheDocument();
  });
});
