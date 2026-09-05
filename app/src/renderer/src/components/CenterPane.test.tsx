import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('./Terminal', () => ({
  TerminalHost: ({ visible, currentPath }: { visible: boolean; currentPath: string | null }) => (
    <div data-testid="terminal" data-current={currentPath ?? ''} hidden={!visible}>term</div>
  ),
}));
vi.mock('./docs/DocsTab', () => ({
  DocsTab: ({ hidden, selected }: { hidden: boolean; selected: string | null }) => <div data-testid="docs" hidden={hidden}>{selected ?? 'none'}</div>,
}));
vi.mock('./insights/InsightsView', () => ({
  InsightsView: ({ hidden }: { hidden: boolean }) => <div data-testid="insights" hidden={hidden}>ins</div>,
}));
vi.mock('./skills/SkillsView', () => ({
  SkillsView: ({ hidden }: { hidden: boolean }) => <div data-testid="skills" hidden={hidden}>skills</div>,
}));

import { CenterPane, type CenterTab } from './CenterPane';

const el = (tab: CenterTab, onTab: (t: CenterTab) => void) => (
  <CenterPane tab={tab} onTab={onTab} sessions={{}} currentPath={'C:\\P\\a'} onRestart={() => {}}
    path={'C:\\P\\a'} stageDocs={[]} selectedDoc="docs/product/prd.md" onSelectDoc={() => {}} docsRevision={0} onNotice={() => {}}
    insightsRevision={0} onRevealCommit={() => {}}
    skills={{ projectPath: null, installs: [], busy: false, canAnalyze: false,
      onFetch: async () => null, onInstall: () => {}, onAction: () => {}, onAnalyze: () => {} }} />
);

function pane(tab: CenterTab, onTab = vi.fn()) {
  return render(el(tab, onTab));
}

describe('CenterPane', () => {
  it('keeps both panels mounted and toggles hidden by tab', () => {
    const onTab = vi.fn();
    const { rerender } = pane('terminal', onTab);
    expect(screen.getByTestId('terminal')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('docs')).toHaveAttribute('hidden');
    expect(screen.getByRole('tab', { name: '終端機' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: '文件' }));
    expect(onTab).toHaveBeenCalledWith('docs');
    rerender(el('docs', onTab));
    expect(screen.getByTestId('terminal')).toHaveAttribute('hidden');
    expect(screen.getByTestId('docs')).not.toHaveAttribute('hidden');
    expect(screen.getByText('docs/product/prd.md', { selector: '.center-title' })).toBeInTheDocument();
  });

  it('shows only the insights panel on the insights tab', () => {
    const onTab = vi.fn();
    const { rerender } = pane('terminal', onTab);
    expect(screen.getByTestId('insights')).toHaveAttribute('hidden');
    fireEvent.click(screen.getByRole('tab', { name: '洞察' }));
    expect(onTab).toHaveBeenCalledWith('insights');
    rerender(el('insights', onTab));
    expect(screen.getByTestId('insights')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('terminal')).toHaveAttribute('hidden');
    expect(screen.getByTestId('docs')).toHaveAttribute('hidden');
    expect(screen.getByRole('tab', { name: '洞察' })).toHaveAttribute('aria-selected', 'true');
    // 洞察分頁沒有文件標題
    expect(document.querySelector('.center-title')).toBeNull();
  });
});
