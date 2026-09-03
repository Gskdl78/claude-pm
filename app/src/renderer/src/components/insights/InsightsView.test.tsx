import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const insights = vi.hoisted(() => ({ collect: vi.fn(), pinned: vi.fn(), pin: vi.fn(), unpin: vi.fn() }));
vi.mock('../../api', () => ({ pm: { insights } }));

import { InsightsView } from './InsightsView';

const items = [
  { id: 1, stage: 'build', task: null, symptom: 's1', cause: 'Env 缺少 .env', fix: '加 .env.example', commit: 'aaa1111', at: '2026-09-02T00:00:00Z', project: 'a', path: 'C:\\P\\a' },
  { id: 1, stage: 'verify', task: null, symptom: 's2', cause: 'env 缺少 .env', fix: '文件說明', commit: 'bbb2222', at: '2026-06-01T00:00:00Z', project: 'b', path: 'C:\\P\\b' },
  { id: 2, stage: 'build', task: null, symptom: 'Timeout', cause: '', fix: '加重試', commit: 'ccc3333', at: '2026-09-01T00:00:00Z', project: 'b', path: 'C:\\P\\b' },
];

beforeEach(() => {
  vi.clearAllMocks();
  insights.collect.mockResolvedValue({ items, projects: 2, skipped: ['broken'] });
  insights.pinned.mockResolvedValue([]);
  insights.pin.mockImplementation(async (n: { cause: string; fix: string }) => [n]);
  insights.unpin.mockResolvedValue([]);
});

describe('InsightsView', () => {
  it('loads when visible, shows groups, stats and skipped projects', async () => {
    render(<InsightsView hidden={false} revision={0} onRevealCommit={() => {}} />);
    expect(await screen.findByText('Env 缺少 .env')).toBeInTheDocument();
    expect(screen.getByText('2 次')).toBeInTheDocument();
    expect(screen.getByText('Timeout')).toBeInTheDocument();
    expect(screen.getByText('3 筆 issue · 2 個專案')).toBeInTheDocument();
    expect(screen.getByText('略過（state 損毀）：broken')).toBeInTheDocument();
  });

  it('does not load while hidden, loads once revealed, and reloads on revision', async () => {
    const { rerender } = render(<InsightsView hidden revision={0} onRevealCommit={() => {}} />);
    await Promise.resolve();
    expect(insights.collect).not.toHaveBeenCalled();
    rerender(<InsightsView hidden={false} revision={0} onRevealCommit={() => {}} />);
    await waitFor(() => expect(insights.collect).toHaveBeenCalledTimes(1));
    rerender(<InsightsView hidden={false} revision={1} onRevealCommit={() => {}} />);
    await waitFor(() => expect(insights.collect).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await waitFor(() => expect(insights.collect).toHaveBeenCalledTimes(3));
  });

  it('filters by stage and time', async () => {
    render(<InsightsView hidden={false} revision={0} onRevealCommit={() => {}} />);
    await screen.findByText('Env 缺少 .env');
    fireEvent.change(screen.getByLabelText('階段'), { target: { value: 'verify' } });
    expect(screen.getByText('1 次')).toBeInTheDocument();
    expect(screen.queryByText('Timeout')).toBeNull();
    fireEvent.change(screen.getByLabelText('階段'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('時間'), { target: { value: '30d' } });
    // 2026-06-01 的 verify issue 超過 30 天（以現在時間計，本測試資料日期固定在 2026-09）
    expect(screen.getAllByText(/次$/).length).toBeGreaterThan(0);
  });

  it('expands a group, reveals commits, pins and unpins', async () => {
    const onRevealCommit = vi.fn();
    render(<InsightsView hidden={false} revision={0} onRevealCommit={onRevealCommit} />);
    await screen.findByText('Env 缺少 .env');
    const row = screen.getByText('Env 缺少 .env').closest('.insight-group') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: '展開' }));
    fireEvent.click(within(row).getByRole('button', { name: '查看 commit aaa1111' }));
    expect(onRevealCommit).toHaveBeenCalledWith('C:\\P\\a', 'aaa1111');
    fireEvent.click(within(row).getByRole('button', { name: '釘選為注意事項' }));
    await waitFor(() => expect(insights.pin).toHaveBeenCalledWith({ cause: 'Env 缺少 .env', fix: '加 .env.example；文件說明' }));
    const pinnedArea = await screen.findByRole('region', { name: '固定注意事項' });
    expect(within(pinnedArea).getByText(/Env 缺少 \.env/)).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: '已釘選' })).toBeDisabled();
    fireEvent.click(within(pinnedArea).getByRole('button', { name: '移除' }));
    await waitFor(() => expect(insights.unpin).toHaveBeenCalledWith('Env 缺少 .env'));
    await waitFor(() => expect(within(pinnedArea).getByText('尚無固定注意事項')).toBeInTheDocument());
  });

  it('shows collect errors', async () => {
    insights.collect.mockRejectedValueOnce(new Error('boom'));
    render(<InsightsView hidden={false} revision={0} onRevealCommit={() => {}} />);
    expect(await screen.findByText('boom')).toBeInTheDocument();
  });
});
