import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { pm } from '../api';

export interface SessionState {
  status: 'running' | 'exited';
  idle: boolean;
  /** 每次成功啟動 +1；改變時清空該終端機 */
  launchSeq: number;
  usedContinue: boolean;
}

interface Props {
  /** 目前活著（或剛結束）的 session，以專案路徑為鍵 */
  sessions: Record<string, SessionState>;
  currentPath: string | null;
  /** 文件分頁時為 false，元件仍掛載 */
  visible?: boolean;
  /** 來自設定的終端機字型大小 */
  fontSize?: number;
  /** 對話框關閉時由 App 遞增，用來把焦點交還給終端機 */
  focusSeq?: number;
  onRestart: (path: string) => void;
}

interface Inst { term: XTerm; fit: FitAddon; host: HTMLDivElement; dispose: () => void; seenLaunchSeq: number }

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

/** 為一個 session 建立 xterm、DOM 容器、快捷鍵與輸入轉送；path 決定寫到哪個 pty。 */
function createInstance(path: string, container: HTMLElement, fontSize: number, launchSeq: number): Inst {
  const host = document.createElement('div');
  host.className = 'xterm-host';
  host.hidden = true;
  container.appendChild(host);
  const term = new XTerm({
    fontFamily: 'Cascadia Mono, Consolas, monospace',
    fontSize,
    cursorBlink: true,
    allowProposedApi: true,
    theme: { background: '#1e1e1e' },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(host);

  const selection = () => term.getSelection?.() ?? '';
  const copySelection = () => {
    const text = selection();
    if (!text) return;
    void copyToClipboard(text);
    term.clearSelection?.();
  };
  const paste = () => {
    void readClipboard().then((text) => { if (text) pm.pty.write(path, text); });
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
  host.addEventListener('contextmenu', onContextMenu);
  const input = term.onData((d) => pm.pty.write(path, d));
  const ro = new ResizeObserver(() => { fit.fit(); pm.pty.resize(path, term.cols, term.rows); });
  ro.observe(host);

  return {
    term, fit, host, seenLaunchSeq: launchSeq,
    dispose: () => {
      ro.disconnect();
      host.removeEventListener('contextmenu', onContextMenu);
      input.dispose();
      term.dispose();
      host.remove();
    },
  };
}

/**
 * 每個 session 一個 xterm，全部常駐；切換專案只是換 hidden，
 * 捲軸內容因此不會因為切走再切回而消失。session 從 sessions 消失時才銷毀。
 */
export function TerminalHost({ sessions, currentPath, visible = true, fontSize = 14, focusSeq = 0, onRestart }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const instances = useRef(new Map<string, Inst>());
  const fontSizeRef = useRef(fontSize);
  fontSizeRef.current = fontSize;

  // 所有 session 的輸出只訂閱一次，依 path 分派
  useEffect(() => pm.pty.onData((path, d) => instances.current.get(path)?.term.write(d)), []);

  // 有 session 沒實例 → 建；實例沒 session → 銷毀
  const keys = Object.keys(sessions).sort().join('\n');
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    for (const path of Object.keys(sessions)) {
      if (!instances.current.has(path)) instances.current.set(path, createInstance(path, el, fontSizeRef.current, sessions[path]!.launchSeq));
    }
    for (const [path, inst] of instances.current) {
      if (!(path in sessions)) { inst.dispose(); instances.current.delete(path); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  useEffect(() => () => { for (const inst of instances.current.values()) inst.dispose(); instances.current.clear(); }, []);

  const current = currentPath ? sessions[currentPath] : undefined;
  const fitCurrent = (focus: boolean) => {
    if (!currentPath) return;
    const inst = instances.current.get(currentPath);
    if (!inst) return;
    inst.fit.fit();
    pm.pty.resize(currentPath, inst.term.cols, inst.term.rows);
    if (focus) inst.term.focus();
  };

  // 顯示 / 隱藏、launchSeq 重設、切換後 fit + focus
  useEffect(() => {
    for (const [path, inst] of instances.current) inst.host.hidden = !visible || path !== currentPath;
    if (!currentPath || !current) return;
    const inst = instances.current.get(currentPath);
    if (!inst) return;
    // 新的 pty 是新的對話：不清空的話輸出會接在上一次的捲軸後面
    if (inst.seenLaunchSeq !== current.launchSeq) { inst.seenLaunchSeq = current.launchSeq; inst.term.reset(); }
    if (visible && current.status === 'running') fitCurrent(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, currentPath, visible, current?.launchSeq, current?.status]);

  // 字級：所有實例一起改，目前的重新 fit
  const seenFont = useRef(fontSize);
  useEffect(() => {
    if (seenFont.current === fontSize) return;
    seenFont.current = fontSize;
    for (const inst of instances.current.values()) inst.term.options.fontSize = fontSize;
    if (visible) fitCurrent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontSize]);

  // 對話框關掉後把焦點還給終端機；掛載那次不搶焦點（seq 相同直接跳過）
  const seenFocus = useRef(focusSeq);
  useEffect(() => {
    if (seenFocus.current === focusSeq) return;
    seenFocus.current = focusSeq;
    if (visible && current?.status === 'running' && currentPath) instances.current.get(currentPath)?.term.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeq]);

  return (
    <div className="term" hidden={!visible}>
      <div className="term-hosts" ref={container} />
      {currentPath && (!current || current.status === 'exited') && (
        <div className="overlay">
          <span>{current ? 'Claude Code 已結束' : 'Claude Code 未啟動'}</span>
          <button onClick={() => onRestart(currentPath)}>{current ? '重新啟動' : '啟動'}</button>
        </div>
      )}
    </div>
  );
}
