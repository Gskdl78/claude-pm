import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async (_id: string, code: string) => ({ svg: `<svg data-code="${code}"></svg>` })),
}));
vi.mock('mermaid', () => ({ default: mermaid }));

import { MarkdownView } from './MarkdownView';

function view(html: string, over: Partial<{ onNavigate: (r: string) => void; onOpenExternal: (u: string) => void; onOpenPath: (r: string) => void }> = {}) {
  return render(
    <MarkdownView html={html} fromRel="docs/product/prd.md"
      onNavigate={over.onNavigate ?? (() => {})} onOpenExternal={over.onOpenExternal ?? (() => {})} onOpenPath={over.onOpenPath ?? (() => {})} />,
  );
}

beforeEach(() => { vi.clearAllMocks(); });

describe('MarkdownView', () => {
  it('routes link clicks: doc → onNavigate, external → onOpenExternal, other relative → onOpenPath, anchor → the browser', () => {
    const onNavigate = vi.fn(); const onOpenExternal = vi.fn(); const onOpenPath = vi.fn();
    view('<p><a href="../tech/tasks.md">t</a> <a href="https://x.y/">e</a> <a href="demo/index.html">d</a> <a href="#top">a</a></p>', { onNavigate, onOpenExternal, onOpenPath });
    fireEvent.click(screen.getByText('t'));
    expect(onNavigate).toHaveBeenCalledWith('docs/tech/tasks.md');
    fireEvent.click(screen.getByText('e'));
    expect(onOpenExternal).toHaveBeenCalledWith('https://x.y/');
    fireEvent.click(screen.getByText('d'));
    expect(onOpenPath).toHaveBeenCalledWith('docs/product/demo/index.html');
    fireEvent.click(screen.getByText('a'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onOpenExternal).toHaveBeenCalledTimes(1);
    expect(onOpenPath).toHaveBeenCalledTimes(1);
  });

  it('only hands viewable files to the system, never executables', () => {
    const onOpenPath = vi.fn();
    view('<p><a href="../../setup.bat">bat</a> <a href="assets/logo.png">png</a></p>', { onOpenPath });
    fireEvent.click(screen.getByText('bat'));
    expect(onOpenPath).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('png'));
    expect(onOpenPath).toHaveBeenCalledTimes(1);
    expect(onOpenPath).toHaveBeenCalledWith('docs/product/assets/logo.png');
  });

  it('cancels middle clicks so a link can never open a window', () => {
    const onOpenExternal = vi.fn();
    view('<p><a href="https://x.y/">e</a></p>', { onOpenExternal });
    const ev = new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true });
    fireEvent(screen.getByText('e'), ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(onOpenExternal).not.toHaveBeenCalled();
  });

  it('renders mermaid blocks into svg and marks failures', async () => {
    const { container } = view('<pre class="mermaid">graph TD; A--&gt;B</pre><pre class="mermaid">bad</pre>');
    mermaid.render.mockImplementationOnce(async (_id: string, code: string) => ({ svg: `<svg data-code="${code}"></svg>` }))
      .mockImplementationOnce(async () => { throw new Error('parse'); });
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull());
    expect(container.querySelector('svg')!.getAttribute('data-code')).toBe('graph TD; A-->B');
    await waitFor(() => expect(container.querySelector('.mermaid-error')).not.toBeNull());
    expect(screen.getByText('圖表語法錯誤')).toBeInTheDocument();
    expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ startOnLoad: false, securityLevel: 'strict' }));
  });

  it('does not load mermaid when there are no diagrams', async () => {
    view('<p>plain</p>');
    await Promise.resolve();
    expect(mermaid.render).not.toHaveBeenCalled();
  });
});
