import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DocList } from './DocList';

const entries = [
  { rel: 'docs/build/log.md', size: 1, mtimeMs: 1 },
  { rel: 'docs/product/prd.md', size: 1, mtimeMs: 1 },
  { rel: 'docs/tech/tasks.md', size: 1, mtimeMs: 1 },
  { rel: 'docs/misc.md', size: 1, mtimeMs: 1 },
];

describe('DocList', () => {
  it('shows current-stage docs first, then all docs grouped by folder', () => {
    const onSelect = vi.fn();
    render(<DocList entries={entries} stageDocs={['docs\\product\\prd.md', 'docs/product/demo/index.html']} selected="docs/tech/tasks.md" onSelect={onSelect} />);
    const stage = screen.getByRole('group', { name: '目前階段' });
    expect(within(stage).getByRole('button', { name: 'product/prd.md' })).toBeInTheDocument();
    expect(within(stage).queryByText(/index\.html/)).toBeNull();
    const all = screen.getByRole('group', { name: '全部文件' });
    expect(within(all).getByText('產品')).toBeInTheDocument();
    expect(within(all).getByText('技術')).toBeInTheDocument();
    expect(within(all).getByText('實作')).toBeInTheDocument();
    expect(within(all).getByText('其他')).toBeInTheDocument();
    expect(within(all).getByRole('button', { name: 'tech/tasks.md' })).toHaveClass('active');
    fireEvent.click(within(all).getByRole('button', { name: 'build/log.md' }));
    expect(onSelect).toHaveBeenCalledWith('docs/build/log.md');
  });
  it('shows a hint when there are no docs', () => {
    render(<DocList entries={[]} stageDocs={[]} selected={null} onSelect={() => {}} />);
    expect(screen.getByText('此專案尚無文件')).toBeInTheDocument();
  });
});
