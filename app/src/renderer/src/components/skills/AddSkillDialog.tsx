import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface Props {
  open: boolean;
  busy: boolean;
  error: string | null;
  onFetch: (source: string) => void;
  onCancel: () => void;
}

export function AddSkillDialog({ open, busy, error, onFetch, onCancel }: Props) {
  const [source, setSource] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);
  useFocusTrap(rootRef, open);
  // 每次打開都清空，取消後不殘留上次貼的網址
  useEffect(() => {
    if (open && !wasOpen.current) setSource('');
    wasOpen.current = open;
  }, [open]);

  if (!open) return null;

  const value = source.trim();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value || busy) return;
    onFetch(value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Escape' && !busy) onCancel(); };

  return (
    <div ref={rootRef} className="dialog" role="dialog" aria-modal="true" aria-label="加入 skill" onKeyDown={onKeyDown}>
      <form className="settings" onSubmit={submit}>
        <h3>加入 skill</h3>
        <div className="field">
          <label htmlFor="skill-source">skill 來源</label>
          <input id="skill-source" value={source} disabled={busy} autoFocus
            placeholder="https://github.com/使用者/倉庫 或 .../tree/main/skills/名稱"
            onChange={(e) => setSource(e.target.value)} />
          <div className="muted">也可以貼 git@ 網址，或一個本機資料夾的絕對路徑。</div>
          {error && <div className="error">{error}</div>}
        </div>
        <div className="row">
          <button type="submit" disabled={busy || !value}>{busy ? '取得中…' : '取得'}</button>
          <button type="button" disabled={busy} onClick={onCancel}>取消</button>
        </div>
      </form>
    </div>
  );
}
