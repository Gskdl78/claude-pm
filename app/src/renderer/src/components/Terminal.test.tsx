import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PmApi } from '../../../shared/types';
import type { SessionState } from './Terminal';

type KeyHandler = (e: KeyboardEvent) => boolean;

type Term = {
  cols: number; rows: number; options: Record<string, unknown>;
  loadAddon: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>;
  onData: ReturnType<typeof vi.fn>; getSelection: ReturnType<typeof vi.fn>; clearSelection: ReturnType<typeof vi.fn>;
  attachCustomKeyEventHandler: ReturnType<typeof vi.fn>;
};

const terms: Term[] = [];

function makeTerm(): Term {
  return {
    cols: 80, rows: 24, options: {},
    loadAddon: vi.fn(), open: vi.fn(), write: vi.fn(), reset: vi.fn(), focus: vi.fn(), dispose: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    getSelection: vi.fn(() => ''), clearSelection: vi.fn(), attachCustomKeyEventHandler: vi.fn(),
  };
}

vi.mock('@xterm/xterm', () => ({ Terminal: class { constructor() { const t = makeTerm(); terms.push(t); return t; } } }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

class RO {
  observe() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;

let dataCb: (path: string, data: string) => void = () => {};
const ptyWrite = vi.fn();
const ptyResize = vi.fn();
(window as unknown as { pm: Partial<PmApi> }).pm = {
  pty: {
    start: vi.fn(), write: ptyWrite, resize: ptyResize, kill: vi.fn(),
    list: vi.fn(async () => []), focus: vi.fn(),
    onData: vi.fn((cb: (path: string, data: string) => void) => { dataCb = cb; return () => {}; }),
    onExit: vi.fn(() => () => {}),
    onIdle: vi.fn(() => () => {}),
  } as unknown as PmApi['pty'],
};
const pm = (window as unknown as { pm: PmApi }).pm;

const writeText = vi.fn(async () => {});
const readText = vi.fn(async () => 'from clipboard');
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText, readText },
});

const { TerminalHost } = await import('./Terminal');

const A = 'C:\\P\\a';
const B = 'C:\\P\\b';
const running = (launchSeq = 1): SessionState => ({ status: 'running', idle: false, launchSeq, usedContinue: false });

/** 取某個實例登記的自訂鍵盤處理器 */
const keyHandlerOf = (i: number) => terms[i]!.attachCustomKeyEventHandler.mock.calls[0]![0] as KeyHandler;

/** A keydown that records whether the handler suppressed the browser default. */
function key(init: Partial<KeyboardEvent> & { key: string }) {
  const e = { type: 'keydown', ctrlKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn(), ...init };
  return e as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

/** Lets the promise chain in the paste path settle before asserting. */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  terms.length = 0;
  ptyWrite.mockClear();
  ptyResize.mockClear();
  writeText.mockClear();
  readText.mockClear();
});

describe('TerminalHost', () => {
  it('creates one xterm per session, shows only the current one and routes data by path', () => {
    const { container, rerender } = render(<TerminalHost sessions={{ [A]: running(), [B]: running() }} currentPath={A} onRestart={() => {}} />);
    expect(terms).toHaveLength(2);
    const hosts = container.querySelectorAll('.xterm-host');
    expect(hosts).toHaveLength(2);
    expect(hosts[0]).not.toHaveAttribute('hidden'); expect(hosts[1]).toHaveAttribute('hidden');
    dataCb(B, 'for b'); dataCb(A, 'for a');
    expect(terms[1]!.write).toHaveBeenCalledWith('for b'); expect(terms[0]!.write).toHaveBeenCalledWith('for a');
    rerender(<TerminalHost sessions={{ [A]: running(), [B]: running() }} currentPath={B} onRestart={() => {}} />);
    expect(hosts[0]).toHaveAttribute('hidden'); expect(hosts[1]).not.toHaveAttribute('hidden');
    expect(terms[1]!.focus).toHaveBeenCalled();
    expect(pm.pty.resize).toHaveBeenLastCalledWith(B, 80, 24);
  });

  it('writes input to the pty of its own session', () => {
    render(<TerminalHost sessions={{ [A]: running(), [B]: running() }} currentPath={A} onRestart={() => {}} />);
    (terms[0]!.onData.mock.calls[0]![0] as (d: string) => void)('from a');
    (terms[1]!.onData.mock.calls[0]![0] as (d: string) => void)('from b');
    expect(ptyWrite).toHaveBeenNthCalledWith(1, A, 'from a');
    expect(ptyWrite).toHaveBeenNthCalledWith(2, B, 'from b');
  });

  it('resets the terminal when launchSeq changes and disposes when a session disappears', () => {
    const { rerender } = render(<TerminalHost sessions={{ [A]: running(1) }} currentPath={A} onRestart={() => {}} />);
    expect(terms[0]!.reset).not.toHaveBeenCalled();
    rerender(<TerminalHost sessions={{ [A]: running(2) }} currentPath={A} onRestart={() => {}} />);
    expect(terms[0]!.reset).toHaveBeenCalledTimes(1);
    rerender(<TerminalHost sessions={{}} currentPath={A} onRestart={() => {}} />);
    expect(terms[0]!.dispose).toHaveBeenCalled();
  });

  it('resets a background instance when its own launchSeq changes', () => {
    const { rerender } = render(<TerminalHost sessions={{ [A]: running(1), [B]: running(1) }} currentPath={A} onRestart={() => {}} />);
    // 背景 session 的 --continue 重試：要清的是它自己的終端機，不是目前這個
    rerender(<TerminalHost sessions={{ [A]: running(1), [B]: running(2) }} currentPath={A} onRestart={() => {}} />);
    expect(terms[1]!.reset).toHaveBeenCalledTimes(1);
    expect(terms[0]!.reset).not.toHaveBeenCalled();
  });

  it('buffers output that arrives before the instance exists and flushes it on creation', () => {
    const { rerender } = render(<TerminalHost sessions={{}} currentPath={null} onRestart={() => {}} />);
    dataCb(A, 'early output');
    expect(terms).toHaveLength(0);
    rerender(<TerminalHost sessions={{ [A]: running() }} currentPath={A} onRestart={() => {}} />);
    expect(terms[0]!.write).toHaveBeenCalledWith('early output');
  });

  it('shows the exited overlay for the current session and a start overlay when there is none', () => {
    const onRestart = vi.fn();
    const { rerender } = render(<TerminalHost sessions={{ [A]: { ...running(), status: 'exited' } }} currentPath={A} onRestart={onRestart} />);
    fireEvent.click(screen.getByRole('button', { name: '重新啟動' }));
    expect(onRestart).toHaveBeenCalledWith(A);
    rerender(<TerminalHost sessions={{}} currentPath={B} onRestart={onRestart} />);
    fireEvent.click(screen.getByRole('button', { name: '啟動' }));
    expect(onRestart).toHaveBeenCalledWith(B);
  });

  it('shows no overlay while the current session is running and none at all without a project', () => {
    const { container, rerender } = render(<TerminalHost sessions={{ [A]: running() }} currentPath={A} onRestart={() => {}} />);
    expect(container.querySelector('.overlay')).toBeNull();
    rerender(<TerminalHost sessions={{ [A]: running() }} currentPath={null} onRestart={() => {}} />);
    expect(container.querySelector('.overlay')).toBeNull();
  });

  it('applies fontSize to every instance and refits the current one', () => {
    const { rerender } = render(<TerminalHost sessions={{ [A]: running(), [B]: running() }} currentPath={A} fontSize={14} onRestart={() => {}} />);
    ptyResize.mockClear();
    rerender(<TerminalHost sessions={{ [A]: running(), [B]: running() }} currentPath={A} fontSize={18} onRestart={() => {}} />);
    expect(terms.every((t) => t.options['fontSize'] === 18)).toBe(true);
    expect(ptyResize).toHaveBeenCalledWith(A, 80, 24);
  });

  it('focusSeq focuses the current running terminal only when visible', () => {
    const { rerender } = render(<TerminalHost sessions={{ [A]: running() }} currentPath={A} focusSeq={0} onRestart={() => {}} />);
    terms[0]!.focus.mockClear();   // 掛載時已經搶過一次焦點
    rerender(<TerminalHost sessions={{ [A]: running() }} currentPath={A} focusSeq={1} onRestart={() => {}} />);
    expect(terms[0]!.focus).toHaveBeenCalledTimes(1);

    rerender(<TerminalHost sessions={{ [A]: running() }} currentPath={A} focusSeq={1} visible={false} onRestart={() => {}} />);
    terms[0]!.focus.mockClear();
    rerender(<TerminalHost sessions={{ [A]: running() }} currentPath={A} focusSeq={2} visible={false} onRestart={() => {}} />);
    expect(terms[0]!.focus).not.toHaveBeenCalled();
  });

  it('does not take the focus on mount just because focusSeq is non-zero', () => {
    render(<TerminalHost sessions={{ [A]: { ...running(), status: 'exited' } }} currentPath={A} focusSeq={7} onRestart={() => {}} />);
    expect(terms[0]!.focus).not.toHaveBeenCalled();
  });

  it('hidden → visible refits the current terminal', () => {
    const { container, rerender } = render(<TerminalHost sessions={{ [A]: running() }} currentPath={A} visible={false} onRestart={() => {}} />);
    expect(container.querySelector('.term')).toHaveAttribute('hidden');
    expect(ptyResize).not.toHaveBeenCalled();
    rerender(<TerminalHost sessions={{ [A]: running() }} currentPath={A} visible onRestart={() => {}} />);
    expect(container.querySelector('.term')).not.toHaveAttribute('hidden');
    expect(ptyResize).toHaveBeenCalledWith(A, 80, 24);
    expect(terms[0]!.focus).toHaveBeenCalled();
  });

  describe('clipboard shortcuts', () => {
    let keyHandler: KeyHandler;
    beforeEach(() => {
      render(<TerminalHost sessions={{ [A]: running() }} currentPath={A} onRestart={() => {}} />);
      keyHandler = keyHandlerOf(0);
    });

    it('copies the selection on Ctrl+Shift+C', () => {
      terms[0]!.getSelection.mockReturnValue('selected text');
      const e = key({ key: 'C', ctrlKey: true, shiftKey: true });
      expect(keyHandler(e)).toBe(false);
      expect(writeText).toHaveBeenCalledWith('selected text');
      expect(e.preventDefault).toHaveBeenCalled();
    });

    it('copies instead of sending ^C when Ctrl+C is pressed with a selection', () => {
      terms[0]!.getSelection.mockReturnValue('selected text');
      expect(keyHandler(key({ key: 'c', ctrlKey: true }))).toBe(false);
      expect(writeText).toHaveBeenCalledWith('selected text');
      expect(terms[0]!.clearSelection).toHaveBeenCalled();
    });

    it('lets Ctrl+C reach the pty when nothing is selected', () => {
      expect(keyHandler(key({ key: 'c', ctrlKey: true }))).toBe(true);
      expect(writeText).not.toHaveBeenCalled();
    });

    it('copies the selection on Ctrl+Insert', () => {
      terms[0]!.getSelection.mockReturnValue('selected text');
      expect(keyHandler(key({ key: 'Insert', ctrlKey: true }))).toBe(false);
      expect(writeText).toHaveBeenCalledWith('selected text');
    });

    it('writes the clipboard to the pty of its own session on Ctrl+Shift+V', async () => {
      const e = key({ key: 'V', ctrlKey: true, shiftKey: true });
      expect(keyHandler(e)).toBe(false);
      await flush();
      expect(readText).toHaveBeenCalled();
      expect(ptyWrite).toHaveBeenCalledWith(A, 'from clipboard');
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
      expect(ptyWrite).toHaveBeenCalledWith(A, 'line one\nline two\n');
    });

    it('ignores keyup so a combo is only acted on once', () => {
      terms[0]!.getSelection.mockReturnValue('selected text');
      expect(keyHandler(key({ key: 'c', ctrlKey: true, shiftKey: true, type: 'keyup' }))).toBe(true);
      expect(writeText).not.toHaveBeenCalled();
    });

    it('does not throw and writes nothing to the pty when the copy rejects', async () => {
      terms[0]!.getSelection.mockReturnValue('selected text');
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

    it('pastes into its own session when there is no selection', async () => {
      const { container } = render(<TerminalHost sessions={{ [A]: running(), [B]: running() }} currentPath={B} onRestart={() => {}} />);
      const e = rightClick(container.querySelectorAll('.xterm-host')[1]!);
      expect(e.defaultPrevented).toBe(true);
      await flush();
      expect(ptyWrite).toHaveBeenCalledWith(B, 'from clipboard');
      expect(writeText).not.toHaveBeenCalled();
    });

    it('copies when there is a selection', async () => {
      const { container } = render(<TerminalHost sessions={{ [A]: running() }} currentPath={A} onRestart={() => {}} />);
      terms[0]!.getSelection.mockReturnValue('selected text');
      rightClick(container.querySelector('.xterm-host')!);
      await flush();
      expect(writeText).toHaveBeenCalledWith('selected text');
      expect(ptyWrite).not.toHaveBeenCalled();
    });
  });
});
