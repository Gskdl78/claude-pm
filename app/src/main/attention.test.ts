import { describe, it, expect, vi } from 'vitest';
import { createAttention, type AttentionWindow } from './attention';

function fakeWin(focused: boolean) {
  const handlers: Record<string, Array<() => void>> = {};
  const win: AttentionWindow & { fire(event: string): void } = {
    isFocused: () => focused,
    isDestroyed: () => false,
    flashFrame: vi.fn(),
    on: (event, cb) => { (handlers[event] ??= []).push(cb); return win; },
    fire: (event) => { for (const cb of handlers[event] ?? []) cb(); },
  };
  return win;
}

describe('attention', () => {
  it('does nothing while the window is focused', () => {
    const win = fakeWin(true);
    const notify = vi.fn();
    const a = createAttention({ win, notify });
    a.idle('demo');
    expect(win.flashFrame).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('flashes and notifies when unfocused', () => {
    const win = fakeWin(false);
    const notify = vi.fn();
    const a = createAttention({ win, notify });
    a.idle('demo');
    expect(win.flashFrame).toHaveBeenCalledWith(true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('demo 等待你的回覆', '回到 claude-pm 繼續對話');
    // 每個閒置期間只通知一次是 IdleDetector 的責任；attention 收到幾次就送幾次。
    a.idle('demo');
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('stops flashing on focus', () => {
    const win = fakeWin(false);
    const a = createAttention({ win, notify: vi.fn() });
    a.idle('demo');
    win.fire('focus');
    expect(win.flashFrame).toHaveBeenLastCalledWith(false);
  });

  it('swallows notify failures and still flashes', () => {
    const win = fakeWin(false);
    const a = createAttention({ win, notify: () => { throw new Error('no notification center'); } });
    expect(() => a.idle('demo')).not.toThrow();
    expect(win.flashFrame).toHaveBeenCalledWith(true);
  });

  it('ignores a destroyed window', () => {
    const win = fakeWin(false);
    win.isDestroyed = () => true;
    const notify = vi.fn();
    const a = createAttention({ win, notify });
    a.idle('demo');
    expect(win.flashFrame).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('notifies for a background session even when focused, without flashing', () => {
    const win = fakeWin(true);
    const notify = vi.fn();
    const a = createAttention({ win, notify });
    a.idle('beta', { background: true });
    expect(win.flashFrame).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('beta 等待你的回覆', '切換到 beta 專案繼續對話');
  });

  it('background + unfocused flashes and notifies', () => {
    const win = fakeWin(false);
    const notify = vi.fn();
    createAttention({ win, notify }).idle('beta', { background: true });
    expect(win.flashFrame).toHaveBeenCalledWith(true);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
