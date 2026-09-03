import { type KeyboardEvent } from 'react';
import type { StageName } from '../../../../shared/types';
import { COMMIT_PREFIXES, applyPrefix, prefixForStage } from '../../../../shared/commit-prefix';

interface Props {
  busy: boolean;
  stagedCount: number;
  /** 還沒有任何 commit 時沒有「上一次提交」可修改 */
  noCommits: boolean;
  /** 目前階段：決定前綴列高亮哪一個；沒有 state 時為 null */
  stage: StageName | 'done' | null;
  /** 輸入狀態放在 GitPanel，切換分頁時才不會遺失 */
  message: string;
  amend: boolean;
  onMessageChange: (message: string) => void;
  onAmendChange: (amend: boolean) => void;
  onCommit: (message: string, amend: boolean) => void;
}

export function CommitBox({ busy, stagedCount, noCommits, stage, message, amend, onMessageChange, onAmendChange, onCommit }: Props) {
  const trimmed = message.trim();
  const canCommit = !busy && trimmed.length > 0 && (stagedCount > 0 || amend);
  const hint = trimmed.length === 0 ? '請先輸入 commit 訊息' : stagedCount === 0 && !amend ? '還沒有已暫存的變更' : '';
  const suggested = prefixForStage(stage);
  const submit = () => { if (canCommit) onCommit(trimmed, amend); };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
  };
  return (
    <div className="commit-box">
      {/* 前綴只插入到訊息開頭（已有候選前綴則替換），不自動填寫其他內容 */}
      <div className="prefix-row" role="group" aria-label="commit 前綴">
        {COMMIT_PREFIXES.map((p) => (
          <button key={p} type="button" className={p === suggested ? 'primary prefix-btn' : 'ghost prefix-btn'}
            title={p === suggested ? '目前階段建議的前綴' : '插入前綴'} disabled={busy}
            onClick={() => onMessageChange(applyPrefix(message, p))}>
            {p.trim()}
          </button>
        ))}
      </div>
      <textarea aria-label="commit 訊息" placeholder="輸入 commit 訊息…（Ctrl+Enter 提交）" rows={3}
        value={message} disabled={busy} onChange={(e) => onMessageChange(e.target.value)} onKeyDown={onKeyDown} />
      <div className="commit-row">
        <label className={noCommits ? 'muted' : ''}>
          <input type="checkbox" checked={amend} disabled={busy || noCommits} onChange={(e) => onAmendChange(e.target.checked)} />
          {' '}修改上一次提交
        </label>
        <button type="button" className="primary" disabled={!canCommit} onClick={submit}>提交</button>
      </div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}
