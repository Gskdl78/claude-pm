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

  it('does not load while hidden and loads on every reveal', async () => {
    const { rerender } = render(<InsightsView hidden revision={0} onRevealCommit={() => {}} />);
    await Promise.resolve();
    expect(insights.collect).not.toHaveBeenCalled();
    // 隱藏時 revision 變動不能發 IPC
    rerender(<InsightsView hidden revision={1} onRevealCommit={() => {}} />);
    await Promise.resolve();
    expect(insights.collect).not.toHaveBeenCalled();
    rerender(<InsightsView hidden={false} revision={1} onRevealCommit={() => {}} />);
    await waitFor(() => expect(insights.collect).toHaveBeenCalledTimes(1));
    // 顯示中 revision 變動要重讀
    rerender(<InsightsView hidden={false} revision={2} onRevealCommit={() => {}} />);
    await waitFor(() => expect(insights.collect).toHaveBeenCalledTimes(2));
    // 收起再打開，即使 revision 沒變也要重讀
    rerender(<InsightsView hidden revision={2} onRevealCommit={() => {}} />);
    rerender(<InsightsView hidden={false} revision={2} onRevealCommit={() => {}} />);
    await waitFor(() => expect(insights.collect).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    await waitFor(() => expect(insights.collect).toHaveBeenCalledTimes(4));
  });

  it('filters by stage and time', async () => {
    // 時間篩選以「現在」為基準，固定時鐘才不會隨日曆改變結果。
    vi.useFakeTimers({ now: new Date('2026-09-03T12:00:00Z'), shouldAdvanceTime: true });
    try {
      render(<InsightsView hidden={false} revision={0} onRevealCommit={() => {}} />);
      await screen.findByText('Env 缺少 .env');
      // 群組標題取自第一筆 issue 的根因，切到 verify 後會變成小寫的 env，故用不分大小寫的比對。
      const envRow = () => screen.getByText(/^[Ee]nv 缺少 \.env$/).closest('.insight-group') as HTMLElement;
      expect(within(envRow()).getByText('2 次')).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText('階段'), { target: { value: 'verify' } });
      expect(within(envRow()).getByText('1 次')).toBeInTheDocument();
      expect(screen.queryByText('Timeout')).toBeNull();
      fireEvent.change(screen.getByLabelText('階段'), { target: { value: 'all' } });

      // 2026-06-01 的 verify issue 落在 30 天與 7 天窗外，另外兩筆（09-01、09-02）都在窗內
      fireEvent.change(screen.getByLabelText('時間'), { target: { value: '30d' } });
      expect(within(envRow()).getByText('1 次')).toBeInTheDocument();
      expect(screen.getByText('Timeout')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('時間'), { target: { value: '7d' } });
      expect(within(envRow()).getByText('1 次')).toBeInTheDocument();
      expect(screen.getByText('Timeout')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('時間'), { target: { value: 'all' } });
      expect(within(envRow()).getByText('2 次')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('truncates an over-long fix to 500 characters when pinning', async () => {
    const long = 'x'.repeat(600);
    insights.collect.mockResolvedValue({
      items: [{ ...items[0], fix: long }], projects: 1, skipped: [],
    });
    render(<InsightsView hidden={false} revision={0} onRevealCommit={() => {}} />);
    await screen.findByText('Env 缺少 .env');
    fireEvent.click(screen.getByRole('button', { name: '釘選為注意事項' }));
    await waitFor(() => expect(insights.pin).toHaveBeenCalledTimes(1));
    const note = insights.pin.mock.calls[0]![0] as { cause: string; fix: string };
    expect(note.cause).toBe('Env 缺少 .env');
    expect(note.fix).toHaveLength(500);
    expect(note.fix).toBe('x'.repeat(500));
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
