import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NewProjectDialog } from './NewProjectDialog';

describe('NewProjectDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<NewProjectDialog open={false} busy={false} error={null} onSubmit={() => {}} onCancel={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('validates name locally and submits a valid one', () => {
    const onSubmit = vi.fn();
    render(<NewProjectDialog open busy={false} error={null} onSubmit={onSubmit} onCancel={() => {}} />);
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
    render(<NewProjectDialog open busy error="folder already exists" onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('folder already exists')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '建立中…' })).toBeDisabled();
  });
});
