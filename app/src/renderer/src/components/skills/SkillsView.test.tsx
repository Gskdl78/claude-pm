import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { SkillFetchResult, SkillInstall } from '../../../../shared/types';
import { SkillsView } from './SkillsView';

const install = (name: string, status: SkillInstall['status']): SkillInstall => ({ name, status, needsRestart: false });

const fetchResult: SkillFetchResult = {
  cacheId: 'a'.repeat(16),
  reports: [{
    name: 'foo', dirName: 'foo', nameMatchesDir: true, description: 'd',
    frontmatter: {}, rel: '', files: [], totalBytes: 0,
    executables: [], findings: [], hosts: [], collisions: [], skillMd: '# x',
  }],
};

const view = (over: Partial<ComponentProps<typeof SkillsView>> = {}) =>
  render(<SkillsView hidden={false} projectPath="C:\\P\\a" installs={[]} busy={false} canAnalyze
    onFetch={vi.fn()} onInstall={vi.fn()} onAction={vi.fn()} onAnalyze={vi.fn()} {...over} />);

describe('SkillsView', () => {
  it('groups installed skills by status', () => {
    view({ installs: [install('t', 'trial'), install('a', 'adopted'), install('g', 'global')] });
    expect(screen.getByRole('heading', { name: '試用中' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '專案採用' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '全域' })).toBeInTheDocument();
  });

  it('offers adopt and promote for a trial skill', () => {
    view({ installs: [install('t', 'trial')] });
    expect(screen.getByRole('button', { name: '採用 t' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '升為全域 t' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '移除 t' })).toBeInTheDocument();
  });

  it('offers only promote and remove for an adopted skill', () => {
    view({ installs: [install('a', 'adopted')] });
    expect(screen.queryByRole('button', { name: '採用 a' })).toBeNull();
    expect(screen.getByRole('button', { name: '升為全域 a' })).toBeInTheDocument();
  });

  it('offers only remove for a global skill', () => {
    const onAction = vi.fn();
    view({ installs: [install('g', 'global')], onAction });
    expect(screen.queryByRole('button', { name: '升為全域 g' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '移除 g' }));
    expect(onAction).toHaveBeenCalledWith('g', 'remove-global');
  });

  it('goes straight to the report when the source has one skill', async () => {
    const onFetch = vi.fn().mockResolvedValue(fetchResult);
    view({ onFetch });
    fireEvent.click(screen.getByRole('button', { name: '加入 skill' }));
    fireEvent.change(screen.getByLabelText('skill 來源'), { target: { value: 'https://github.com/u/r' } });
    fireEvent.click(screen.getByRole('button', { name: '取得' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '試用' })).toBeInTheDocument());
  });

  it('tells the user to open a project first', () => {
    view({ projectPath: null });
    expect(screen.getByText(/先在左邊開一個專案/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '加入 skill' })).toBeDisabled();
  });

  it('renders nothing visible when hidden', () => {
    view({ hidden: true, installs: [install('t', 'trial')] });
    expect(screen.queryByRole('button', { name: '加入 skill' })).toBeNull();
  });
});
