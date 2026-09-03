import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const docs = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn(), write: vi.fn() }));
const git = vi.hoisted(() => ({ run: vi.fn() }));
const openPath = vi.hoisted(() => vi.fn(async () => ''));
const openExternal = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../api', () => ({ pm: { docs, git, openPath, openExternal } }));
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg></svg>' })) } }));

import { DocsTab } from './DocsTab';

const P = 'C:\\P\\alpha';
const entries = [
  { rel: 'docs/product/prd.md', size: 1, mtimeMs: 1 },
  { rel: 'docs/verify/checklist.md', size: 1, mtimeMs: 1 },
];

function tab(over: Partial<{ selected: string | null; onSelect: (r: string | null) => void; docsRevision: number; onNotice: (t: string, k?: string) => void; path: string | null }> = {}) {
  return render(
    <DocsTab path={over.path === undefined ? P : over.path} stageDocs={['docs/product/prd.md']} selected={over.selected ?? null}
      onSelect={over.onSelect ?? (() => {})} docsRevision={over.docsRevision ?? 0} hidden={false} onNotice={over.onNotice ?? (() => {})} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  docs.list.mockResolvedValue(entries);
  docs.read.mockImplementation(async (_p: string, rel: string) => (rel.endsWith('checklist.md') ? '# 清單\n- [ ] 第一項\n' : '# PRD\n\n[tasks](../tech/tasks.md)\n'));
  docs.write.mockResolvedValue(undefined);
  git.run.mockResolvedValue({ ok: true, code: 0, stdout: '', stderr: '', command: 'git commit' });
});

describe('DocsTab', () => {
  it('lists docs and renders the selected markdown file', async () => {
    tab({ selected: 'docs/product/prd.md' });
    expect(await screen.findByRole('heading', { level: 1, name: 'PRD' })).toBeInTheDocument();
    expect(docs.read).toHaveBeenCalledWith(P, 'docs/product/prd.md');
    expect(screen.getByRole('button', { name: '用外部程式開啟' })).toBeInTheDocument();
  });

  it('selects a file from the list and navigates through relative links', async () => {
    const onSelect = vi.fn();
    tab({ selected: 'docs/product/prd.md', onSelect });
    fireEvent.click(await screen.findByText('tasks'));
    expect(onSelect).toHaveBeenCalledWith('docs/tech/tasks.md');
    fireEvent.click(screen.getByRole('button', { name: 'verify/checklist.md' }));
    expect(onSelect).toHaveBeenCalledWith('docs/verify/checklist.md');
  });

  it('re-reads on docsRevision and reports a deleted file', async () => {
    const { rerender } = tab({ selected: 'docs/product/prd.md' });
    await screen.findByRole('heading', { level: 1, name: 'PRD' });
    docs.list.mockResolvedValueOnce([entries[1]!]);
    rerender(<DocsTab path={P} stageDocs={[]} selected="docs/product/prd.md" onSelect={() => {}} docsRevision={1} hidden={false} onNotice={() => {}} />);
    expect(await screen.findByText('檔案已不存在')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'PRD' })).toBeNull();
  });

  it('toggles a checklist item, writes the file and commits only that path', async () => {
    const onNotice = vi.fn();
    tab({ selected: 'docs/verify/checklist.md', onNotice });
    const box = await screen.findByRole('checkbox', { name: '第一項' });
    fireEvent.click(box);
    await waitFor(() => expect(docs.write).toHaveBeenCalledWith(P, 'docs/verify/checklist.md', '# 清單\n- [x] 第一項\n'));
    await waitFor(() => expect(git.run).toHaveBeenCalledWith(P, { kind: 'commitPaths', message: 'docs(verify): 更新清單', paths: ['docs/verify/checklist.md'] }));
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith('驗證清單已更新並提交', 'hint'));
    expect(screen.getByRole('checkbox', { name: '第一項' })).toBeChecked();
  });

  it('keeps the new content but reports when the commit fails', async () => {
    const onNotice = vi.fn();
    git.run.mockResolvedValueOnce({ ok: false, code: 1, stdout: '', stderr: 'nothing to commit', command: 'git commit' });
    tab({ selected: 'docs/verify/checklist.md', onNotice });
    fireEvent.click(await screen.findByRole('checkbox', { name: '第一項' }));
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith('驗證清單提交失敗：nothing to commit', 'error'));
    expect(screen.getByRole('checkbox', { name: '第一項' })).toBeChecked();
  });

  it('shows a friendly message for oversized files and opens externally', async () => {
    docs.read.mockRejectedValueOnce(new Error('doc too large'));
    tab({ selected: 'docs/product/prd.md' });
    expect(await screen.findByText('檔案過大（超過 2 MB），請用外部程式開啟')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '用外部程式開啟' }));
    expect(openPath).toHaveBeenCalledWith('C:\\P\\alpha\\docs\\product\\prd.md');
  });

  it('shows placeholders without a project or selection', async () => {
    const { rerender } = tab({ path: null });
    expect(screen.getByText('選擇專案後顯示文件')).toBeInTheDocument();
    rerender(<DocsTab path={P} stageDocs={[]} selected={null} onSelect={() => {}} docsRevision={0} hidden={false} onNotice={() => {}} />);
    expect(await screen.findByText('選擇左側的文件')).toBeInTheDocument();
  });
});
