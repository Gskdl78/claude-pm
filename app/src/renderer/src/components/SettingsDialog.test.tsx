import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsDialog } from './SettingsDialog';
import { DEFAULT_SETTINGS } from '../../../shared/config-schema';
import type { AppConfig } from '../../../shared/types';

const config: AppConfig = { root: 'C:\\P', lastProject: null, recent: [], ...DEFAULT_SETTINGS };
const noop = () => {};

function dialog(over: Partial<{ open: boolean; busy: boolean; error: string | null; onPickFolder: () => Promise<string | null>; onSave: (s: unknown) => void; onCancel: () => void }> = {}) {
  return render(
    <SettingsDialog open={over.open ?? true} config={config} busy={over.busy ?? false} error={over.error ?? null}
      onPickFolder={over.onPickFolder ?? (async () => null)} onSave={over.onSave ?? noop} onCancel={over.onCancel ?? noop} />,
  );
}

describe('SettingsDialog', () => {
  it('renders nothing when closed and initialises fields from config when open', () => {
    const { rerender } = dialog({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<SettingsDialog open config={config} busy={false} error={null} onPickFolder={async () => null} onSave={noop} onCancel={noop} />);
    expect(screen.getByLabelText('專案根目錄')).toHaveValue('C:\\P');
    expect(screen.getByLabelText('預設實作模型')).toHaveValue('opus');
    expect(screen.getByLabelText('審核模型')).toHaveValue('fable');
    expect(screen.getByLabelText('審核退回上限')).toHaveValue(3);
    expect(screen.getByLabelText('終端機字型大小')).toHaveValue(14);
    expect(screen.getByLabelText('資訊框預設高度')).toHaveValue(160);
    expect(screen.getByLabelText('Claude Code 等待輸入時閃爍並通知')).toBeChecked();
  });

  it('submits root and a patch of changed settings', () => {
    const onSave = vi.fn();
    dialog({ onSave });
    fireEvent.change(screen.getByLabelText('專案根目錄'), { target: { value: 'D:\\W' } });
    fireEvent.change(screen.getByLabelText('預設實作模型'), { target: { value: 'sonnet' } });
    fireEvent.change(screen.getByLabelText('審核退回上限'), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText('Claude Code 等待輸入時閃爍並通知'));
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(onSave).toHaveBeenCalledWith({ root: 'D:\\W', patch: { implModel: 'sonnet', reviewModel: 'fable', maxRetries: 5, termFontSize: 14, logHeight: 160, notifyOnIdle: false } });
  });

  it('blocks saving on invalid values and shows messages', () => {
    const onSave = vi.fn();
    dialog({ onSave });
    fireEvent.change(screen.getByLabelText('終端機字型大小'), { target: { value: '30' } });
    expect(screen.getByText('請輸入 10–24 的整數')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '儲存' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('專案根目錄'), { target: { value: '   ' } });
    expect(screen.getByText('請輸入資料夾路徑')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('fills root from the folder picker and ignores cancel', async () => {
    // 明確標註回傳型別，才能在下面 mockResolvedValueOnce(null) 模擬取消
    const onPickFolder = vi.fn(async (): Promise<string | null> => 'E:\\Picked');
    dialog({ onPickFolder });
    fireEvent.click(screen.getByRole('button', { name: '選擇…' }));
    await waitFor(() => expect(screen.getByLabelText('專案根目錄')).toHaveValue('E:\\Picked'));
    onPickFolder.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: '選擇…' }));
    await waitFor(() => expect(onPickFolder).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('專案根目錄')).toHaveValue('E:\\Picked');
  });

  it('shows the error, disables everything while busy, and cancels on Escape', () => {
    const onCancel = vi.fn();
    dialog({ error: 'root not found: X', busy: true, onCancel });
    expect(screen.getByText('root not found: X')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '儲存中…' })).toBeDisabled();
    expect(screen.getByLabelText('專案根目錄')).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();   // busy 時 Esc 無效
  });

  it('cancels on Escape when idle', () => {
    const onCancel = vi.fn();
    dialog({ onCancel });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });
});
