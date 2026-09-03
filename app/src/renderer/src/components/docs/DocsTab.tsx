import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocEntry } from '../../../../shared/types';
import { gitResultText } from '../../../../shared/git-errors';
import { pm } from '../../api';
import { errorMessage } from '../../errors';
import { DocList } from './DocList';
import { MarkdownView } from './MarkdownView';
import { ChecklistView } from './ChecklistView';
import { renderMarkdown } from './markdown';
import { CHECKLIST_COMMIT_MESSAGE, CHECKLIST_REL, toggleChecklistLine } from './checklist';

interface Props {
  path: string | null;
  stageDocs: string[];
  selected: string | null;
  onSelect: (rel: string | null) => void;
  /** App 收到 project:docs 時 +1 */
  docsRevision: number;
  hidden: boolean;
  onNotice: (text: string, kind?: 'hint' | 'error') => void;
}

const EMPTY: DocEntry[] = [];

function friendly(e: unknown): string {
  const m = errorMessage(e);
  if (/doc too large/.test(m)) return '檔案過大（超過 2 MB），請用外部程式開啟';
  if (/doc not found|ENOENT/.test(m)) return '檔案已不存在';
  return m;
}

export function DocsTab({ path, stageDocs, selected, onSelect, docsRevision, hidden, onNotice }: Props) {
  const [entries, setEntries] = useState<DocEntry[]>(EMPTY);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seqRef = useRef(0);

  // 專案、選檔或 docs 變更都重新列表並讀取；用 seq 丟掉過期的回應。
  useEffect(() => {
    seqRef.current += 1;
    const seq = seqRef.current;
    if (!path) { setEntries(EMPTY); setContent(null); setError(null); return; }
    void (async () => {
      try {
        const list = await pm.docs.list(path);
        if (seq !== seqRef.current) return;
        setEntries(list);
        if (!selected) { setContent(null); setError(null); return; }
        if (!list.some((e) => e.rel === selected)) { setContent(null); setError('檔案已不存在'); return; }
        const text = await pm.docs.read(path, selected);
        if (seq !== seqRef.current) return;
        setContent(text); setError(null);
      } catch (e) {
        if (seq !== seqRef.current) return;
        setContent(null); setError(friendly(e));
      }
    })();
  }, [path, selected, docsRevision]);

  const isChecklist = selected === CHECKLIST_REL;
  const html = useMemo(() => (content !== null && !isChecklist ? renderMarkdown(content) : ''), [content, isChecklist]);

  const toggle = async (line: number) => {
    if (!path || !selected || content === null || busy) return;
    let next: string;
    try { next = toggleChecklistLine(content, line); } catch (e) { onNotice(`驗證清單寫入失敗：${errorMessage(e)}`, 'error'); return; }
    setBusy(true);
    try {
      await pm.docs.write(path, selected, next);
      setContent(next);
      const r = await pm.git.run(path, { kind: 'commitPaths', message: CHECKLIST_COMMIT_MESSAGE, paths: [selected] });
      if (r.ok) onNotice('驗證清單已更新並提交', 'hint');
      else onNotice(`驗證清單提交失敗：${gitResultText(r)}`, 'error');
    } catch (e) {
      onNotice(`驗證清單寫入失敗：${errorMessage(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const openExternally = () => {
    if (path && selected) void pm.openPath(`${path}\\${selected.replace(/\//g, '\\')}`);
  };

  return (
    <div className="docs" hidden={hidden}>
      {!path && <div className="muted docs-empty">選擇專案後顯示文件</div>}
      {path && (
        <>
          <DocList entries={entries} stageDocs={stageDocs} selected={selected} onSelect={onSelect} />
          <div className="doc-view">
            {!selected && <div className="muted">選擇左側的文件</div>}
            {selected && (
              <div className="doc-head">
                <span className="doc-name" title={selected}>{selected}</span>
                <button onClick={openExternally}>用外部程式開啟</button>
              </div>
            )}
            {error && <div className="error">{error}</div>}
            {selected && content !== null && (isChecklist
              ? <ChecklistView text={content} busy={busy} onToggle={(line) => { void toggle(line); }} />
              : <MarkdownView html={html} fromRel={selected}
                  onNavigate={onSelect}
                  onOpenExternal={(u) => { void pm.openExternal(u); }}
                  onOpenPath={(rel) => { if (path) void pm.openPath(`${path}\\${rel.replace(/\//g, '\\')}`); }} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
