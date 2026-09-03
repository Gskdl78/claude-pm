import { useRef, useState, type FormEvent } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

type Mode = 'create' | 'clone';

interface Props {
  open: boolean;
  busy: boolean;
  error: string | null;
  /** 建立空專案（scaffold） */
  onSubmit: (name: string) => void;
  /** 從網址或本機路徑 git clone 到 root/<name> */
  onClone: (source: string, name: string) => void;
  onCancel: () => void;
}

/** 由 clone 來源推導預設專案名：取最後一段、去掉尾端 / 與 .git；不合法（中文、空白…）就留白讓使用者填。 */
export function deriveName(source: string): string {
  const trimmed = source.trim().replace(/[\\/]+$/, '');
  const last = trimmed.split(/[\\/:]/).filter((s) => s.length > 0).pop() ?? '';
  const name = last.replace(/\.git$/i, '');
  return NAME_RE.test(name) ? name : '';
}

export function NewProjectDialog({ open, busy, error, onSubmit, onClone, onCancel }: Props) {
  const [mode, setMode] = useState<Mode>('create');
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  // 使用者手動改過名稱之後，來源再變也不覆寫
  const [nameTouched, setNameTouched] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  if (!open) return null;

  const nameValid = NAME_RE.test(name);
  const sourceReady = source.trim().length > 0;
  const valid = mode === 'create' ? nameValid : nameValid && sourceReady;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    if (mode === 'clone') onClone(source.trim(), name);
    else onSubmit(name);
  };
  const changeSource = (v: string) => {
    setSource(v);
    if (!nameTouched) setName(deriveName(v));
  };
  const changeName = (v: string) => { setName(v); setNameTouched(true); };
  const tab = (m: Mode, label: string) => (
    <button type="button" aria-pressed={mode === m} className={mode === m ? 'active' : ''} disabled={busy} onClick={() => setMode(m)}>{label}</button>
  );

  return (
    <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-label="新專案">
      <form onSubmit={submit}>
        <div className="new-project-tabs">
          {tab('create', '建立空專案')}
          {tab('clone', '從 URL 複製')}
        </div>
        {mode === 'clone' && (
          <>
            <label htmlFor="new-project-source">來源網址或路徑</label>
            <input id="new-project-source" value={source} autoFocus disabled={busy} placeholder="https://github.com/帳號/倉庫.git 或本機資料夾" onChange={(e) => changeSource(e.target.value)} />
            <div className="muted small">接受 https:// 或 git@ 網址，或本機資料夾的絕對路徑；只做 git clone，不會自動初始化 pm（之後可在側欄按「初始化」）。</div>
          </>
        )}
        <label htmlFor="new-project-name">專案名稱</label>
        <input id="new-project-name" value={name} autoFocus={mode === 'create'} disabled={busy} onChange={(e) => changeName(e.target.value)} />
        {name && !nameValid && <div className="error">英數開頭，僅允許英數 . _ -，最長 64 字元</div>}
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} disabled={busy}>取消</button>
          <button type="submit" disabled={!valid || busy}>
            {mode === 'clone' ? (busy ? '複製中…' : '複製') : (busy ? '建立中…' : '建立')}
          </button>
        </div>
      </form>
    </div>
  );
}
