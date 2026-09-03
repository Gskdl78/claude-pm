import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const gh = vi.hoisted(() => ({ check: vi.fn(), repoCreate: vi.fn() }));
vi.mock('../../api', () => ({ pm: { gh } }));

import { PublishWizard, defaultRepoName } from './PublishWizard';

const P = 'C:\\P\\alpha';
const ready = { installed: true, version: 'gh version 2.60.0', authed: true, detail: 'Logged in to github.com' };
const missing = { installed: false, version: null, authed: false, detail: 'spawn gh ENOENT' };

beforeEach(() => { vi.clearAllMocks(); });

describe('PublishWizard', () => {
  it('defaults to gh create with the folder name when gh is installed and logged in', async () => {
    gh.check.mockResolvedValue(ready);
    const onSubmit = vi.fn();
    render(<PublishWizard path={P} noCommits={false} busy={false} onSubmit={onSubmit} onCancel={() => {}} />);
    expect(screen.getByRole('dialog', { name: '發佈到 GitHub' })).toBeInTheDocument();
    expect(await screen.findByText('GitHub CLI：已安裝（gh version 2.60.0）')).toBeInTheDocument();
    expect(screen.getByText('登入狀態：已登入')).toBeInTheDocument();
    expect(gh.check).toHaveBeenCalledWith(P);
    expect(screen.getByLabelText('新建 GitHub 倉庫')).toBeChecked();
    expect(screen.getByLabelText('倉庫名稱')).toHaveValue('alpha');
    expect(screen.getByLabelText('私人')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(onSubmit).toHaveBeenCalledWith({ mode: 'create', name: 'alpha', isPrivate: true });
    fireEvent.change(screen.getByLabelText('倉庫名稱'), { target: { value: '-bad' } });
    expect(screen.getByText(/名稱不合法/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('倉庫名稱'), { target: { value: '.' } });
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('倉庫名稱'), { target: { value: 'my-app' } });
    fireEvent.click(screen.getByLabelText('公開'));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(onSubmit).toHaveBeenLastCalledWith({ mode: 'create', name: 'my-app', isPrivate: false });
    expect(screen.getByText(/不提供強制推送/)).toBeInTheDocument();
  });

  it('falls back to the URL route when gh is missing and validates the url', async () => {
    gh.check.mockResolvedValue(missing);
    const onSubmit = vi.fn();
    render(<PublishWizard path={P} noCommits={false} busy={false} onSubmit={onSubmit} onCancel={() => {}} />);
    expect(await screen.findByText('GitHub CLI：未安裝')).toBeInTheDocument();
    expect(screen.getByText(/winget install GitHub\.cli/)).toBeInTheDocument();
    expect(screen.getByLabelText('新建 GitHub 倉庫')).toBeDisabled();
    expect(screen.getByLabelText('貼現有倉庫網址')).toBeChecked();
    const next = screen.getByRole('button', { name: '下一步' });
    expect(next).toBeDisabled();
    fireEvent.change(screen.getByLabelText('倉庫網址'), { target: { value: 'http://github.com/o/r' } });
    expect(screen.getByText(/網址不合法/)).toBeInTheDocument();
    expect(next).toBeDisabled();
    fireEvent.change(screen.getByLabelText('倉庫網址'), { target: { value: ' git@github.com:o/r.git ' } });
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(onSubmit).toHaveBeenCalledWith({ mode: 'url', url: 'git@github.com:o/r.git' });
  });

  it('explains a logged-out gh, blocks without commits, cancels on Escape and reports check failures', async () => {
    gh.check.mockResolvedValue({ ...ready, authed: false, detail: 'You are not logged into any GitHub hosts' });
    const onCancel = vi.fn();
    const { unmount } = render(<PublishWizard path={P} noCommits={true} busy={false} onSubmit={() => {}} onCancel={onCancel} />);
    expect(await screen.findByText('登入狀態：未登入')).toBeInTheDocument();
    expect(screen.getByText(/gh auth login/)).toBeInTheDocument();
    expect(screen.getByLabelText('新建 GitHub 倉庫')).toBeDisabled();
    expect(screen.getByText(/還沒有任何提交/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('倉庫網址'), { target: { value: 'https://github.com/o/r.git' } });
    expect(screen.getByRole('button', { name: '下一步' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    unmount();

    gh.check.mockRejectedValue(new Error('boom'));
    render(<PublishWizard path={P} noCommits={false} busy={false} onSubmit={() => {}} onCancel={onCancel} />);
    expect(await screen.findByText('偵測失敗：boom')).toBeInTheDocument();
    expect(screen.getByLabelText('貼現有倉庫網址')).toBeChecked();
  });
});

describe('defaultRepoName', () => {
  it('uses the last path segment only when it is a valid repo name', () => {
    expect(defaultRepoName('C:\\P\\alpha')).toBe('alpha');
    expect(defaultRepoName('C:\\P\\my_app.v2\\')).toBe('my_app.v2');
    expect(defaultRepoName('/home/u/proj')).toBe('proj');
    expect(defaultRepoName('C:\\P\\中文專案')).toBe('');
    expect(defaultRepoName('C:\\P\\has space')).toBe('');
  });
});

describe('PublishWizard focus and Escape', () => {
  it('focuses the first text input when it opens and cancels on Escape unless busy', async () => {
    gh.check.mockResolvedValue(ready);
    const onCancel = vi.fn();
    const { rerender } = render(<PublishWizard path={P} noCommits={false} busy={false} onSubmit={() => {}} onCancel={onCancel} />);
    await screen.findByText('登入狀態：已登入');
    expect(screen.getByLabelText('倉庫名稱')).toBe(document.activeElement);
    rerender(<PublishWizard path={P} noCommits={false} busy onSubmit={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    rerender(<PublishWizard path={P} noCommits={false} busy={false} onSubmit={() => {}} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('focuses the url input when gh is missing', async () => {
    gh.check.mockResolvedValue(missing);
    render(<PublishWizard path={P} noCommits={false} busy={false} onSubmit={() => {}} onCancel={() => {}} />);
    await screen.findByText('GitHub CLI：未安裝');
    expect(screen.getByLabelText('倉庫網址')).toBe(document.activeElement);
  });
});
