import { useState, type FormEvent } from 'react';

export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

interface Props {
  open: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function NewProjectDialog({ open, busy, error, onSubmit, onCancel }: Props) {
  const [name, setName] = useState('');
  if (!open) return null;
  const valid = NAME_RE.test(name);
  const submit = (e: FormEvent) => { e.preventDefault(); if (valid && !busy) onSubmit(name); };
  return (
    <div className="dialog">
      <form onSubmit={submit}>
        <label htmlFor="new-project-name">專案名稱</label>
        <input id="new-project-name" value={name} autoFocus disabled={busy} onChange={(e) => setName(e.target.value)} />
        {name && !valid && <div className="error">英數開頭，僅允許英數 . _ -，最長 64 字元</div>}
        {error && <div className="error">{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} disabled={busy}>取消</button>
          <button type="submit" disabled={!valid || busy}>{busy ? '建立中…' : '建立'}</button>
        </div>
      </form>
    </div>
  );
}
