import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { AddSkillDialog } from './AddSkillDialog';

const dialog = (over: Partial<ComponentProps<typeof AddSkillDialog>> = {}) =>
  render(<AddSkillDialog open busy={false} error={null} onFetch={vi.fn()} onCancel={vi.fn()} {...over} />);

describe('AddSkillDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = dialog({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('submits the trimmed source', () => {
    const onFetch = vi.fn();
    dialog({ onFetch });
    fireEvent.change(screen.getByLabelText('skill 來源'), { target: { value: '  https://github.com/u/r  ' } });
    fireEvent.click(screen.getByRole('button', { name: '取得' }));
    expect(onFetch).toHaveBeenCalledWith('https://github.com/u/r');
  });

  it('keeps the fetch button disabled while empty or busy', () => {
    dialog();
    expect(screen.getByRole('button', { name: '取得' })).toBeDisabled();
    dialog({ busy: true });
    expect(screen.getByRole('button', { name: '取得中…' })).toBeDisabled();
  });

  it('shows the error message', () => {
    dialog({ error: '看不懂這個來源。' });
    expect(screen.getByText('看不懂這個來源。')).toBeInTheDocument();
  });

  it('closes on Escape when not busy', () => {
    const onCancel = vi.fn();
    dialog({ onCancel });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
