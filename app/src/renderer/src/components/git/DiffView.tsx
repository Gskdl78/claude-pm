import type { KeyboardEvent } from 'react';

interface Props {
  title: string;
  text: string;
  onClose: () => void;
}

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) return 'meta';
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return '';
}

export function DiffView({ title, text, onClose }: Props) {
  const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
  return (
    <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={onKeyDown}>
      <div className="dialog-box diff-box">
        <div className="diff-head">
          <span className="diff-title" title={title}>{title}</span>
          <button type="button" autoFocus onClick={onClose}>關閉</button>
        </div>
        <pre className="diff-body">
          {text.length === 0
            ? <span className="muted">（沒有差異內容）</span>
            : text.split('\n').map((l, i) => <div key={i} className={`dl ${lineClass(l)}`}>{l || ' '}</div>)}
        </pre>
      </div>
    </div>
  );
}
