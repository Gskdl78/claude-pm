import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('./Terminal', () => ({
  Terminal: ({ visible }: { visible: boolean }) => <div data-testid="terminal" hidden={!visible}>term</div>,
}));
vi.mock('./docs/DocsTab', () => ({
  DocsTab: ({ hidden, selected }: { hidden: boolean; selected: string | null }) => <div data-testid="docs" hidden={hidden}>{selected ?? 'none'}</div>,
}));

import { CenterPane } from './CenterPane';

function pane(tab: 'terminal' | 'docs', onTab = vi.fn()) {
  return render(
    <CenterPane tab={tab} onTab={onTab} status="running" launchSeq={0} onRestart={() => {}}
      path="C:\\P\\a" stageDocs={[]} selectedDoc="docs/product/prd.md" onSelectDoc={() => {}} docsRevision={0} onNotice={() => {}} />,
  );
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
    rerender(
      <CenterPane tab="docs" onTab={onTab} status="running" launchSeq={0} onRestart={() => {}}
        path="C:\\P\\a" stageDocs={[]} selectedDoc="docs/product/prd.md" onSelectDoc={() => {}} docsRevision={0} onNotice={() => {}} />,
    );
    expect(screen.getByTestId('terminal')).toHaveAttribute('hidden');
    expect(screen.getByTestId('docs')).not.toHaveAttribute('hidden');
    expect(screen.getByText('docs/product/prd.md', { selector: '.center-title' })).toBeInTheDocument();
  });
});
