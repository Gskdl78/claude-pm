import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { SkillFetchResult, SkillInstall } from '../../../../shared/types';
import { SkillsView } from './SkillsView';

const install = (name: string, status: SkillInstall['status'], description = `${name} 在做某件事`): SkillInstall =>
  ({ name, status, needsRestart: false, description });

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

  it('shows the description when the name is clicked, and hides it again', () => {
    view({ installs: [install('t', 'trial', '把輸入變成知識圖譜')] });
    expect(screen.queryByText('把輸入變成知識圖譜')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 't' }));
    expect(screen.getByText('把輸入變成知識圖譜')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 't' }));
    expect(screen.queryByText('把輸入變成知識圖譜')).toBeNull();
  });

  it('opens only one description at a time', () => {
    view({ installs: [install('a', 'global', 'AAA 說明'), install('b', 'global', 'BBB 說明')] });
    fireEvent.click(screen.getByRole('button', { name: 'a' }));
    expect(screen.getByText('AAA 說明')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'b' }));
    expect(screen.queryByText('AAA 說明')).toBeNull();
    expect(screen.getByText('BBB 說明')).toBeInTheDocument();
  });

  it('says so when a skill has no description', () => {
    view({ installs: [install('t', 'trial', '')] });
    fireEvent.click(screen.getByRole('button', { name: 't' }));
    expect(screen.getByText(/沒有寫 description/)).toBeInTheDocument();
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
