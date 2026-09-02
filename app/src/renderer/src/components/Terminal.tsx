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
}

export function Terminal({ status, launchSeq, onRestart }: Props) {
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

    const offData = pm.pty.onData((d) => term.write(d));
    const input = term.onData((d) => pm.pty.write(d));
    const ro = new ResizeObserver(() => {
      fit.fit();
      pm.pty.resize(term.cols, term.rows);
    });
    ro.observe(host.current);

    return () => {
      ro.disconnect();
      input.dispose();
      offData();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (status === 'running' && termRef.current && fitRef.current) {
      fitRef.current.fit();
      pm.pty.resize(termRef.current.cols, termRef.current.rows);
      termRef.current.focus();
    }
  }, [status, launchSeq]);

  return (
    <div className="term">
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
