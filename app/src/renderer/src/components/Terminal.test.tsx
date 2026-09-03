import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { PmApi } from '../../../shared/types';

type KeyHandler = (e: KeyboardEvent) => boolean;
let keyHandler: KeyHandler = () => true;

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
  getSelection: vi.fn(() => ''),
  clearSelection: vi.fn(),
  attachCustomKeyEventHandler: vi.fn((h: KeyHandler) => { keyHandler = h; }),
};

vi.mock('@xterm/xterm', () => ({ Terminal: class { constructor() { return term; } } }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

class RO {
  observe() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;

const ptyWrite = vi.fn();
(window as unknown as { pm: Partial<PmApi> }).pm = {
  pty: {
    start: vi.fn(), write: ptyWrite, resize: vi.fn(), kill: vi.fn(),
    onData: vi.fn(() => () => {}),
    onExit: vi.fn(() => () => {}),
  } as unknown as PmApi['pty'],
};

const writeText = vi.fn(async () => {});
const readText = vi.fn(async () => 'from clipboard');
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText, readText },
});

const { Terminal } = await import('./Terminal');

/** A keydown that records whether the handler suppressed the browser default. */
function key(init: Partial<KeyboardEvent> & { key: string }) {
  const e = { type: 'keydown', ctrlKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn(), ...init };
  return e as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

/** Lets the promise chain in the paste path settle before asserting. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  term.reset.mockClear();
  term.clearSelection.mockClear();
  term.getSelection.mockReturnValue('');
  ptyWrite.mockClear();
  writeText.mockClear();
  readText.mockClear();
});

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

  describe('clipboard shortcuts', () => {
    beforeEach(() => {
      render(<Terminal status="idle" launchSeq={0} onRestart={() => {}} />);
    });

    it('copies the selection on Ctrl+Shift+C', () => {
      term.getSelection.mockReturnValue('selected text');
      const e = key({ key: 'C', ctrlKey: true, shiftKey: true });
      expect(keyHandler(e)).toBe(false);
      expect(writeText).toHaveBeenCalledWith('selected text');
      expect(e.preventDefault).toHaveBeenCalled();
    });

    it('copies instead of sending ^C when Ctrl+C is pressed with a selection', () => {
      term.getSelection.mockReturnValue('selected text');
      expect(keyHandler(key({ key: 'c', ctrlKey: true }))).toBe(false);
      expect(writeText).toHaveBeenCalledWith('selected text');
      expect(term.clearSelection).toHaveBeenCalled();
    });

    it('lets Ctrl+C reach the pty when nothing is selected', () => {
      expect(keyHandler(key({ key: 'c', ctrlKey: true }))).toBe(true);
      expect(writeText).not.toHaveBeenCalled();
    });

    it('copies the selection on Ctrl+Insert', () => {
      term.getSelection.mockReturnValue('selected text');
      expect(keyHandler(key({ key: 'Insert', ctrlKey: true }))).toBe(false);
      expect(writeText).toHaveBeenCalledWith('selected text');
    });

    it('writes the clipboard to the pty on Ctrl+Shift+V', async () => {
      const e = key({ key: 'V', ctrlKey: true, shiftKey: true });
      expect(keyHandler(e)).toBe(false);
      await flush();
      expect(readText).toHaveBeenCalled();
      expect(ptyWrite).toHaveBeenCalledWith('from clipboard');
      expect(e.preventDefault).toHaveBeenCalled();
    });

    it('pastes on Shift+Insert and on plain Ctrl+V', async () => {
      expect(keyHandler(key({ key: 'Insert', shiftKey: true }))).toBe(false);
      expect(keyHandler(key({ key: 'v', ctrlKey: true }))).toBe(false);
      await flush();
      expect(ptyWrite).toHaveBeenCalledTimes(2);
    });

    it('pastes multi-line text as-is', async () => {
      readText.mockResolvedValueOnce('line one\nline two\n');
      keyHandler(key({ key: 'v', ctrlKey: true, shiftKey: true }));
      await flush();
      expect(ptyWrite).toHaveBeenCalledWith('line one\nline two\n');
    });

    it('ignores keyup so a combo is only acted on once', () => {
      term.getSelection.mockReturnValue('selected text');
      expect(keyHandler(key({ key: 'c', ctrlKey: true, shiftKey: true, type: 'keyup' }))).toBe(true);
      expect(writeText).not.toHaveBeenCalled();
    });

    it('does not throw and writes nothing to the pty when the copy rejects', async () => {
      term.getSelection.mockReturnValue('selected text');
      writeText.mockRejectedValueOnce(new Error('clipboard busy'));
      const e = key({ key: 'C', ctrlKey: true, shiftKey: true });
      expect(keyHandler(e)).toBe(false);
      await flush();
      expect(writeText).toHaveBeenCalledWith('selected text');
      expect(ptyWrite).not.toHaveBeenCalled();
    });

    it('does not throw and does not write to the pty when the paste rejects', async () => {
      readText.mockRejectedValueOnce(new Error('clipboard busy'));
      const e = key({ key: 'V', ctrlKey: true, shiftKey: true });
      expect(keyHandler(e)).toBe(false);
      await flush();
      expect(readText).toHaveBeenCalled();
      expect(ptyWrite).not.toHaveBeenCalled();
    });
  });

  describe('right-click', () => {
    function rightClick(hostEl: Element) {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      hostEl.dispatchEvent(e);
      return e;
    }

    it('pastes when there is no selection', async () => {
      const { container } = render(<Terminal status="idle" launchSeq={0} onRestart={() => {}} />);
      const e = rightClick(container.querySelector('.xterm-host')!);
      expect(e.defaultPrevented).toBe(true);
      await flush();
      expect(ptyWrite).toHaveBeenCalledWith('from clipboard');
      expect(writeText).not.toHaveBeenCalled();
    });

    it('copies when there is a selection', async () => {
      const { container } = render(<Terminal status="idle" launchSeq={0} onRestart={() => {}} />);
      term.getSelection.mockReturnValue('selected text');
      rightClick(container.querySelector('.xterm-host')!);
      await flush();
      expect(writeText).toHaveBeenCalledWith('selected text');
      expect(ptyWrite).not.toHaveBeenCalled();
    });
  });

  it('re-fits, resizes and focuses when it becomes visible again', () => {
    const resize = (window as unknown as { pm: PmApi }).pm.pty.resize as unknown as ReturnType<typeof vi.fn>;
    const { rerender, container } = render(<Terminal status="running" launchSeq={1} onRestart={() => {}} visible={false} />);
    expect(container.querySelector('.term')).toHaveAttribute('hidden');
    term.focus.mockClear();
    resize.mockClear();
    rerender(<Terminal status="running" launchSeq={1} onRestart={() => {}} visible />);
    expect(container.querySelector('.term')).not.toHaveAttribute('hidden');
    expect(term.focus).toHaveBeenCalled();
    expect(resize).toHaveBeenCalledWith(80, 24);
  });

  it('does not fit or focus on mount when it starts visible', () => {
    const resize = (window as unknown as { pm: PmApi }).pm.pty.resize as unknown as ReturnType<typeof vi.fn>;
    term.focus.mockClear();
    resize.mockClear();
    render(<Terminal status="idle" launchSeq={0} onRestart={() => {}} />);
    expect(term.focus).not.toHaveBeenCalled();
    expect(resize).not.toHaveBeenCalled();
  });
});
