import { useEffect, useRef } from 'react';

export interface LogEntry {
  id: number;
  kind: 'cmd' | 'ok' | 'error' | 'hint';
  text: string;
  /** 錯誤的原始 git 輸出 */
  detail?: string;
}

export function OutputLog({ entries }: { entries: LogEntry[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  // jsdom 沒有 scrollIntoView，用 ?. 略過
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [entries]);
  return (
    <div className="git-output" role="log" aria-label="輸出">
      {entries.length === 0 && <div className="muted">尚未執行任何操作</div>}
      {entries.map((e) => (
        <div key={e.id} className={`out ${e.kind}`}>
          <span>{e.kind === 'cmd' ? `> ${e.text}` : e.text}</span>
          {e.detail && <pre className="out-detail">{e.detail}</pre>}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
