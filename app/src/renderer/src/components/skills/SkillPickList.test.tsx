import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SkillReport } from '../../../../shared/types';
import { SkillPickList } from './SkillPickList';

const r = (name: string): SkillReport => ({
  name, dirName: name, nameMatchesDir: true, description: `${name} 做事`,
  frontmatter: {}, rel: `skills/${name}`, files: [], totalBytes: 0,
  executables: [], findings: [], hosts: [], collisions: [], skillMd: '',
});

describe('SkillPickList', () => {
  it('lists every skill with its description', () => {
    render(<SkillPickList reports={[r('a'), r('b')]} onPick={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b 做事')).toBeInTheDocument();
    expect(screen.getByText(/這個來源裡有 2 個 skill/)).toBeInTheDocument();
  });

  it('hands the chosen name back', () => {
    const onPick = vi.fn();
    render(<SkillPickList reports={[r('a'), r('b')]} onPick={onPick} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '查看 b' }));
    expect(onPick).toHaveBeenCalledWith('b');
  });
});
