import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChecklistView } from './ChecklistView';

const text = '# 清單\n說明\n- [ ] 第一項\n- [x] 第二項\n';

describe('ChecklistView', () => {
  it('renders headings, text and checkboxes and reports the toggled line', () => {
    const onToggle = vi.fn();
    render(<ChecklistView text={text} busy={false} onToggle={onToggle} />);
    expect(screen.getByRole('heading', { level: 1, name: '清單' })).toBeInTheDocument();
    expect(screen.getByText('說明')).toBeInTheDocument();
    const first = screen.getByRole('checkbox', { name: '第一項' });
    const second = screen.getByRole('checkbox', { name: '第二項' });
    expect(first).not.toBeChecked();
    expect(second).toBeChecked();
    expect(second.closest('label')).toHaveClass('done');
    fireEvent.click(first);
    expect(onToggle).toHaveBeenCalledWith(2);
  });
  it('disables checkboxes while busy', () => {
    render(<ChecklistView text={text} busy onToggle={() => {}} />);
    expect(screen.getByRole('checkbox', { name: '第一項' })).toBeDisabled();
  });
});
