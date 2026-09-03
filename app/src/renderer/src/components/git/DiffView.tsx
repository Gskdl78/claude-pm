import { Fragment, useMemo, useRef, type KeyboardEvent } from 'react';
import type { GitDiffMode } from '../../../../shared/types';
import { splitHunks } from '../../../../shared/diff-hunks';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface Props {
  title: string;
  text: string;
  /** 開的是哪種 diff；untracked 或沒給（例如顯示提交內容）就沒有逐段按鈕 */
  mode?: GitDiffMode;
  busy?: boolean;
  /** 逐段暫存（unstaged）/ 取消暫存（staged）：帶 hunk 的序號 */
  onHunk?: (index: number) => void;
  onClose: () => void;
}

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) return 'meta';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return '';
}

export function DiffView({ title, text, mode, busy = false, onHunk, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  const parsed = useMemo(() => splitHunks(text), [text]);
  const staging = mode === 'unstaged' || mode === 'staged';
  // 二進位、被 clip 截斷或沒有 hunk 的 diff 切不出可套用的 patch
  const canHunk = !!onHunk && staging && !parsed.binary && !parsed.truncated && parsed.hunks.length > 0;
  const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
  const line = (l: string, key: string | number) => <div key={key} className={`dl ${lineClass(l)}`}>{l || ' '}</div>;

  let body;
  if (text.length === 0) body = <span className="muted">（沒有差異內容）</span>;
  else if (!canHunk) body = text.split('\n').map((l, i) => line(l, i));
  else {
    body = (
      <>
        {parsed.fileHeader.map((l, i) => line(l, `h${i}`))}
        {parsed.hunks.map((h, i) => (
          <Fragment key={`k${i}`}>
            <div className="dl hunk diff-hunk-row">
              <span>{h.header}</span>
              <button type="button" className="hunk-btn" disabled={busy} onClick={() => onHunk?.(i)}>
                {mode === 'staged' ? '取消暫存此段' : '暫存此段'}
              </button>
            </div>
            {h.lines.map((l, j) => line(l, `${i}:${j}`))}
          </Fragment>
        ))}
      </>
    );
  }

  return (
    <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={onKeyDown}>
      <div className="dialog-box diff-box">
        <div className="diff-head">
          <span className="diff-title" title={title}>{title}</span>
          <button type="button" autoFocus onClick={onClose}>關閉</button>
        </div>
        {parsed.truncated && staging && <div className="muted small">差異過長，無法逐段暫存</div>}
        <pre className="diff-body">{body}</pre>
      </div>
    </div>
  );
}
