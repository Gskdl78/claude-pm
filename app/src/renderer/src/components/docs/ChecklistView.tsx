import { createElement } from 'react';
import { parseChecklist } from './checklist';

interface Props {
  text: string;
  /** 寫檔 / 提交進行中：停用所有勾選 */
  busy: boolean;
  onToggle: (line: number) => void;
}

/** docs/verify/checklist.md 專用：逐行顯示，任務行可勾選。 */
export function ChecklistView({ text, busy, onToggle }: Props) {
  const lines = parseChecklist(text);
  return (
    <div className="checklist">
      {lines.map((l) => {
        if (l.kind === 'heading') return createElement(`h${Math.min(l.level, 4)}`, { key: l.line }, l.text);
        if (l.kind === 'task') {
          return (
            <label key={l.line} className={l.checked ? 'done' : ''}>
              <input type="checkbox" checked={l.checked} disabled={busy} onChange={() => onToggle(l.line)} />
              <span>{l.text}</span>
            </label>
          );
        }
        return <p key={l.line}>{l.text}</p>;
      })}
    </div>
  );
}
