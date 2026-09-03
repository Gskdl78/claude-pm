import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { pm } from '../api';

interface Props {
  status: 'idle' | 'running' | 'exited';
  /** Bumped by App on every successful pty start, so each new pty gets re-fitted. */
  launchSeq: number;
  onRestart: () => void;
  /** 文件分頁時為 false，元件仍掛載 */
  visible?: boolean;
}

/**
 * Electron 44's sandboxed renderer grants `clipboard-read`/`clipboard-write`
 * without a prompt on the bundled file:// page, so the standard async
 * clipboard API is enough — no IPC round trip to the main process is needed.
 */
async function copyToClipboard(text: string): Promise<void> {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard busy or denied: dropping the copy is better than crashing input.
  }
}

async function readClipboard(): Promise<string> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}

export function Terminal({ status, launchSeq, onRestart, visible = true }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const term = new XTerm({
      fontFamily: 'Cascadia Mono, Consolas, monospace',
      fontSize: 14,
      cursorBlink: true,
      allowProposedApi: true,
      theme: { background: '#1e1e1e' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const selection = () => term.getSelection?.() ?? '';
    const copySelection = () => {
      const text = selection();
      if (!text) return;
      void copyToClipboard(text);
      term.clearSelection?.();
    };
    const paste = () => {
      void readClipboard().then((text) => { if (text) pm.pty.write(text); });
    };

    // Windows Terminal key conventions. Returning false tells xterm not to
    // handle the key itself; preventDefault also suppresses the browser's own
    // copy/paste edit command, which would otherwise paste a second time.
    const handled = (e: KeyboardEvent) => { e.preventDefault(); return false; };
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== 'keydown') return true;
      const key = e.key.toLowerCase();

      if (e.ctrlKey && e.shiftKey && !e.altKey && key === 'c') { copySelection(); return handled(e); }
      if (e.ctrlKey && !e.shiftKey && key === 'insert') { copySelection(); return handled(e); }
      // Bare Ctrl+C only copies when something is selected; otherwise it must
      // still reach the pty as ^C so Claude Code can be interrupted.
      if (e.ctrlKey && !e.shiftKey && !e.altKey && key === 'c') {
        if (!selection()) return true;
        copySelection();
        return handled(e);
      }

      if (e.ctrlKey && e.shiftKey && !e.altKey && key === 'v') { paste(); return handled(e); }
      if (e.shiftKey && !e.ctrlKey && !e.altKey && key === 'insert') { paste(); return handled(e); }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && key === 'v') { paste(); return handled(e); }

      return true;
    });

    // Windows Terminal style right-click: copy a selection, otherwise paste.
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (selection()) copySelection();
      else paste();
    };
    host.current.addEventListener('contextmenu', onContextMenu);

    const offData = pm.pty.onData((d) => term.write(d));
    const input = term.onData((d) => pm.pty.write(d));
    const ro = new ResizeObserver(() => {
      fit.fit();
      pm.pty.resize(term.cols, term.rows);
    });
    ro.observe(host.current);
    const el = host.current;

    return () => {
      ro.disconnect();
      el.removeEventListener('contextmenu', onContextMenu);
      input.dispose();
      offData();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  const seenSeq = useRef(launchSeq);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    // A new pty is a new session: without this its output would be appended
    // under the previous project's scrollback.
    if (seenSeq.current !== launchSeq) {
      seenSeq.current = launchSeq;
      term.reset();
    }
    if (status === 'running' && fitRef.current) {
      fitRef.current.fit();
      pm.pty.resize(term.cols, term.rows);
      term.focus();
    }
  }, [status, launchSeq]);

  const prevVisible = useRef(visible);

  // 從文件分頁切回來：隱藏期間 ResizeObserver 不會量到尺寸，要主動 fit 一次。
  // 只處理「隱藏 → 顯示」，掛載時交給 [status, launchSeq] 那個 effect。
  useEffect(() => {
    const was = prevVisible.current;
    prevVisible.current = visible;
    if (!visible || was) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    fit.fit();
    pm.pty.resize(term.cols, term.rows);
    term.focus();
  }, [visible]);

  return (
    <div className="term" hidden={!visible}>
      <div className="xterm-host" ref={host} />
      {status === 'exited' && (
        <div className="overlay">
          <span>Claude Code 已結束</span>
          <button onClick={onRestart}>重新啟動</button>
        </div>
      )}
    </div>
  );
}
