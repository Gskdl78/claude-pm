import { useState, type KeyboardEvent } from 'react';

interface Props {
  busy: boolean;
  stagedCount: number;
  /** 還沒有任何 commit 時沒有「上一次提交」可修改 */
  noCommits: boolean;
  onCommit: (message: string, amend: boolean) => void;
}

export function CommitBox({ busy, stagedCount, noCommits, onCommit }: Props) {
  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);
  const trimmed = message.trim();
  const canCommit = !busy && trimmed.length > 0 && (stagedCount > 0 || amend);
  const hint = trimmed.length === 0 ? '請先輸入 commit 訊息' : stagedCount === 0 && !amend ? '還沒有已暫存的變更' : '';
  const submit = () => { if (canCommit) onCommit(trimmed, amend); };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
  };
  return (
    <div className="commit-box">
      <textarea aria-label="commit 訊息" placeholder="輸入 commit 訊息…（Ctrl+Enter 提交）" rows={3}
        value={message} disabled={busy} onChange={(e) => setMessage(e.target.value)} onKeyDown={onKeyDown} />
      <div className="commit-row">
        <label className={noCommits ? 'muted' : ''}>
          <input type="checkbox" checked={amend} disabled={busy || noCommits} onChange={(e) => setAmend(e.target.checked)} />
          {' '}修改上一次提交
        </label>
        <button type="button" className="primary" disabled={!canCommit} onClick={submit}>提交</button>
      </div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}
