import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NewProjectDialog, deriveName } from './NewProjectDialog';

describe('NewProjectDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<NewProjectDialog open={false} busy={false} error={null} onSubmit={() => {}} onClone={() => {}} onCancel={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('validates name locally and submits a valid one', () => {
    const onSubmit = vi.fn();
    render(<NewProjectDialog open busy={false} error={null} onSubmit={onSubmit} onClone={() => {}} onCancel={() => {}} />);
    const input = screen.getByLabelText('專案名稱');
    const submit = screen.getByRole('button', { name: '建立' });
    fireEvent.change(input, { target: { value: 'bad name' } });
    expect(submit).toBeDisabled();
    expect(screen.getByText(/英數開頭/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'my-app' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith('my-app');
  });

  it('shows server error and disables while busy', () => {
    render(<NewProjectDialog open busy error="folder already exists" onSubmit={() => {}} onClone={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('folder already exists')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '建立中…' })).toBeDisabled();
  });
});

describe('NewProjectDialog clone mode', () => {
  const props = { open: true, busy: false, error: null, onSubmit: () => {}, onCancel: () => {} };

  it('switches to clone mode, derives the name from the url until the user edits it, and submits onClone', () => {
    const onClone = vi.fn();
    const onSubmit = vi.fn();
    render(<NewProjectDialog {...props} onSubmit={onSubmit} onClone={onClone} />);
    expect(screen.getByRole('button', { name: '建立空專案' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '從 URL 複製' }));
    const source = screen.getByLabelText('來源網址或路徑');
    const name = screen.getByLabelText('專案名稱');
    const submit = screen.getByRole('button', { name: '複製' });
    expect(submit).toBeDisabled();
    fireEvent.change(source, { target: { value: 'https://github.com/a/my-repo.git' } });
    expect(name).toHaveValue('my-repo');
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(onClone).toHaveBeenCalledWith('https://github.com/a/my-repo.git', 'my-repo');
    expect(onSubmit).not.toHaveBeenCalled();

    // 使用者改過名稱之後，來源再變也不覆寫
    fireEvent.change(name, { target: { value: 'custom' } });
    fireEvent.change(source, { target: { value: 'git@github.com:o/other.git' } });
    expect(name).toHaveValue('custom');
    fireEvent.click(submit);
    expect(onClone).toHaveBeenLastCalledWith('git@github.com:o/other.git', 'custom');

    // 來源清空 → 停用
    fireEvent.change(source, { target: { value: '   ' } });
    expect(submit).toBeDisabled();
  });

  it('derives names from git@ urls, trailing slashes and local paths, and blanks invalid ones', () => {
    expect(deriveName('git@github.com:owner/repo')).toBe('repo');
    expect(deriveName('https://github.com/a/my-repo.git')).toBe('my-repo');
    expect(deriveName('https://github.com/a/my-repo/')).toBe('my-repo');
    expect(deriveName('C:\\Repos\\local-proj')).toBe('local-proj');
    expect(deriveName('https://github.com/a/中文')).toBe('');
    expect(deriveName('')).toBe('');
  });

  it('shows 複製中… while busy in clone mode and keeps create mode untouched', () => {
    const { rerender } = render(<NewProjectDialog {...props} onClone={() => {}} />);
    expect(screen.getByRole('button', { name: '建立' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '從 URL 複製' }));
    rerender(<NewProjectDialog {...props} busy onClone={() => {}} />);
    expect(screen.getByRole('button', { name: '複製中…' })).toBeDisabled();
  });
});
