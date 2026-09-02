import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { PmApi } from '../../../shared/types';

const term = {
  cols: 80,
  rows: 24,
  loadAddon: vi.fn(),
  open: vi.fn(),
  write: vi.fn(),
  reset: vi.fn(),
  focus: vi.fn(),
  dispose: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
};

vi.mock('@xterm/xterm', () => ({ Terminal: class { constructor() { return term; } } }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

class RO {
  observe() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;

(window as unknown as { pm: Partial<PmApi> }).pm = {
  pty: {
    start: vi.fn(), write: vi.fn(), resize: vi.fn(), kill: vi.fn(),
    onData: vi.fn(() => () => {}),
    onExit: vi.fn(() => () => {}),
  } as unknown as PmApi['pty'],
};

const { Terminal } = await import('./Terminal');

beforeEach(() => { term.reset.mockClear(); });

describe('Terminal', () => {
  it('resets the buffer on every new launch but not on mount', () => {
    const { rerender } = render(<Terminal status="idle" launchSeq={0} onRestart={() => {}} />);
    expect(term.reset).not.toHaveBeenCalled();

    rerender(<Terminal status="running" launchSeq={1} onRestart={() => {}} />);
    expect(term.reset).toHaveBeenCalledTimes(1);

    // A status change alone must not wipe the running session's scrollback.
    rerender(<Terminal status="exited" launchSeq={1} onRestart={() => {}} />);
    expect(term.reset).toHaveBeenCalledTimes(1);

    rerender(<Terminal status="running" launchSeq={2} onRestart={() => {}} />);
    expect(term.reset).toHaveBeenCalledTimes(2);
  });
});
