import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdleDetector } from './pty-idle';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function track(d: IdleDetector) {
  const events: string[] = [];
  d.on('idle', () => events.push('idle'));
  d.on('busy', () => events.push('busy'));
  return events;
}

describe('IdleDetector', () => {
  it('stays silent until the first output, then goes idle after the silence window', () => {
    const d = new IdleDetector(3000);
    const events = track(d);
    vi.advanceTimersByTime(10_000);
    expect(events).toEqual([]);
    expect(d.isIdle()).toBe(false);

    d.feed();
    vi.advanceTimersByTime(2999);
    expect(events).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(events).toEqual(['idle']);
    expect(d.isIdle()).toBe(true);
  });

  it('emits busy once when output resumes and idle again after another silence', () => {
    const d = new IdleDetector(3000);
    const events = track(d);
    d.feed();
    vi.advanceTimersByTime(3000);
    d.feed();
    d.feed();
    expect(events).toEqual(['idle', 'busy']);
    expect(d.isIdle()).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(events).toEqual(['idle', 'busy', 'idle']);
  });

  it('continuous output keeps postponing idle', () => {
    const d = new IdleDetector(3000);
    const events = track(d);
    for (let i = 0; i < 10; i++) { d.feed(); vi.advanceTimersByTime(1000); }
    expect(events).toEqual([]);
    vi.advanceTimersByTime(2000);
    expect(events).toEqual(['idle']);
  });

  it('reset clears the pending timer and the idle flag without emitting', () => {
    const d = new IdleDetector(3000);
    const events = track(d);
    d.feed();
    d.reset();
    vi.advanceTimersByTime(5000);
    expect(events).toEqual([]);

    d.feed();
    vi.advanceTimersByTime(3000);
    expect(d.isIdle()).toBe(true);
    d.reset();
    expect(d.isIdle()).toBe(false);
    expect(events).toEqual(['idle']);
    // 重設後第一次輸出不算「從閒置恢復」，不發 busy
    d.feed();
    expect(events).toEqual(['idle']);
  });

  it('accepts injected timers', () => {
    const set = vi.fn(() => 'h');
    const clear = vi.fn();
    const d = new IdleDetector(500, { set, clear });
    d.feed();
    expect(set).toHaveBeenCalledWith(expect.any(Function), 500);
    d.feed();
    expect(clear).toHaveBeenCalledWith('h');
  });
});
