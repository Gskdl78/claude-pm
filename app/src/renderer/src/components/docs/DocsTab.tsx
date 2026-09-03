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

/** 已讀進來的文件；rel 一併記著，才能確認內容屬於目前選取的檔案。 */
interface LoadedDoc {
  rel: string;
  text: string;
}

function friendly(e: unknown): string {
  const m = errorMessage(e);
  if (/doc too large/.test(m)) return '檔案過大（超過 2 MB），請用外部程式開啟';
  if (/doc not found|ENOENT/.test(m)) return '檔案已不存在';
  return m;
}

export function DocsTab({ path, stageDocs, selected, onSelect, docsRevision, hidden, onNotice }: Props) {
  const [entries, setEntries] = useState<DocEntry[]>(EMPTY);
  const [doc, setDoc] = useState<LoadedDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seqRef = useRef(0);
  const pendingRef = useRef(true);
  const selectedRef = useRef(selected);

  // 專案、選檔或 docs 變更都需要重新列表並讀取；隱藏時先記著，切回來再做。
  useEffect(() => { pendingRef.current = true; }, [path, selected, docsRevision]);

  // 用 seq 丟掉過期的回應：只有最後一次請求可以寫進狀態。
  useEffect(() => {
    selectedRef.current = selected;
    // 隱藏時不列表也不讀檔；沒有待處理的更新時（例如只是切回分頁）也不必重做。
    if (hidden || !pendingRef.current) return;
    pendingRef.current = false;
    seqRef.current += 1;
    const seq = seqRef.current;
    if (!path) { setEntries(EMPTY); setDoc(null); setError(null); return; }
    void (async () => {
      try {
        const list = await pm.docs.list(path);
        if (seq !== seqRef.current) return;
        setEntries(list);
        if (!selected) { setDoc(null); setError(null); return; }
        if (!list.some((e) => e.rel === selected)) { setDoc(null); setError('檔案已不存在'); return; }
        const text = await pm.docs.read(path, selected);
        if (seq !== seqRef.current) return;
        setDoc({ rel: selected, text }); setError(null);
      } catch (e) {
        if (seq !== seqRef.current) return;
        setDoc(null); setError(friendly(e));
      }
    })();
  }, [path, selected, docsRevision, hidden]);

  // 只有內容確實屬於目前選取的檔案時才顯示，否則會把上一份文件掛在新檔名底下。
  const shown = doc !== null && doc.rel === selected ? doc : null;
  const isChecklist = selected === CHECKLIST_REL;
  const html = useMemo(() => (shown && !isChecklist ? renderMarkdown(shown.text) : ''), [shown, isChecklist]);

  const toggle = async (line: number) => {
    if (!path || busy) return;
    if (!doc || doc.rel !== selected || selected !== CHECKLIST_REL) return;
    const rel = selected;
    let next: string;
    try { next = toggleChecklistLine(doc.text, line); } catch (e) { onNotice(`驗證清單寫入失敗：${errorMessage(e)}`, 'error'); return; }
    setBusy(true);
    try {
      try {
        await pm.docs.write(path, rel, next);
      } catch (e) {
        onNotice(`驗證清單寫入失敗：${errorMessage(e)}`, 'error');
        return;
      }
      // 寫檔期間選取可能已經換掉，那份內容就不屬於畫面上的檔案了。
      setDoc((cur) => (selectedRef.current === rel && cur !== null && cur.rel === rel ? { rel, text: next } : cur));
      setError(null);
      try {
        const r = await pm.git.run(path, { kind: 'commitPaths', message: CHECKLIST_COMMIT_MESSAGE, paths: [rel] });
        if (r.ok) onNotice('驗證清單已更新並提交', 'hint');
        else onNotice(`驗證清單提交失敗：${gitResultText(r)}`, 'error');
      } catch (e) {
        onNotice(`驗證清單提交失敗：${errorMessage(e)}`, 'error');
      }
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
            {selected && !shown && !error && <div className="muted">載入中…</div>}
            {shown && (isChecklist
              ? <ChecklistView text={shown.text} busy={busy} onToggle={(line) => { void toggle(line); }} />
              : <MarkdownView html={html} fromRel={shown.rel}
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
