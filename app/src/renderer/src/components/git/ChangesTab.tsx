import type { GitDiffMode, GitFileChange, GitStatus, StageName } from '../../../../shared/types';
import { CommitBox } from './CommitBox';

export interface ChangesTabProps {
  status: GitStatus;
  busy: boolean;
  /** 目前階段，轉給 CommitBox 的前綴列 */
  stage: StageName | 'done' | null;
  /** commit 輸入由 GitPanel 保管，切換分頁時不會遺失 */
  message: string;
  amend: boolean;
  onMessageChange: (message: string) => void;
  onAmendChange: (amend: boolean) => void;
  onStage: (file: string) => void;
  onUnstage: (file: string) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onDiscard: (file: string, untracked: boolean) => void;
  onDiff: (file: string, mode: GitDiffMode) => void;
  onCommit: (message: string, amend: boolean) => void;
}

function code(f: GitFileChange, mode: GitDiffMode): string {
  if (f.untracked) return '?';
  if (f.conflicted) return '⚠';
  return (mode === 'staged' ? f.index : f.work).trim() || '·';
}

interface RowProps {
  f: GitFileChange;
  mode: GitDiffMode;
  busy: boolean;
  onDiff: (file: string, mode: GitDiffMode) => void;
  action: { label: string; symbol: string; onClick: (file: string) => void };
  onDiscard?: (file: string, untracked: boolean) => void;
}

function Row({ f, mode, busy, onDiff, action, onDiscard }: RowProps) {
  return (
    <div className={`file-row${f.conflicted ? ' conflicted' : ''}`}>
      <span className={`file-code ${mode}`}>{code(f, mode)}</span>
      <button type="button" className="file-name" title={f.origPath ? `${f.origPath} → ${f.path}` : f.path} onClick={() => onDiff(f.path, mode)}>
        {f.path}
      </button>
      <button type="button" className="mini" aria-label={`${action.label}：${f.path}`} title={action.label} disabled={busy} onClick={() => action.onClick(f.path)}>
        {action.symbol}
      </button>
      {onDiscard && (
        <button type="button" className="mini danger-text" aria-label={`丟棄變更：${f.path}`} title="丟棄變更" disabled={busy} onClick={() => onDiscard(f.path, f.untracked)}>
          ✕
        </button>
      )}
    </div>
  );
}

export function ChangesTab(p: ChangesTabProps) {
  const { status, busy } = p;
  const conflicts = status.files.filter((f) => f.conflicted);
  const staged = status.files.filter((f) => f.staged);
  const unstaged = status.files.filter((f) => f.unstaged || f.untracked);
  return (
    <div className="changes">
      {conflicts.length > 0 && (
        <section className="file-group">
          <header><span className="danger-text">衝突（{conflicts.length}）</span></header>
          {conflicts.map((f) => (
            <Row key={`c:${f.path}`} f={f} mode="unstaged" busy={busy} onDiff={p.onDiff}
              action={{ label: '標記為已解決', symbol: '✓', onClick: p.onStage }} />
          ))}
        </section>
      )}
      <section className="file-group">
        <header>
          <span>已暫存（{staged.length}）</span>
          <button type="button" className="mini-text" disabled={busy || staged.length === 0} onClick={p.onUnstageAll}>全部取消</button>
        </header>
        {staged.length === 0 && <div className="muted empty">沒有已暫存的變更</div>}
        {staged.map((f) => (
          <Row key={`s:${f.path}`} f={f} mode="staged" busy={busy} onDiff={p.onDiff}
            action={{ label: '取消暫存', symbol: '−', onClick: p.onUnstage }} />
        ))}
      </section>
      <section className="file-group">
        <header>
          <span>未暫存（{unstaged.length}）</span>
          <button type="button" className="mini-text" disabled={busy || unstaged.length === 0} onClick={p.onStageAll}>全部加入</button>
        </header>
        {unstaged.length === 0 && <div className="muted empty">工作目錄沒有變更</div>}
        {unstaged.map((f) => (
          <Row key={`u:${f.path}`} f={f} mode={f.untracked ? 'untracked' : 'unstaged'} busy={busy} onDiff={p.onDiff}
            action={{ label: '加入暫存', symbol: '+', onClick: p.onStage }} onDiscard={p.onDiscard} />
        ))}
      </section>
      <CommitBox busy={busy} stagedCount={staged.length} noCommits={status.noCommits} stage={p.stage}
        message={p.message} amend={p.amend} onMessageChange={p.onMessageChange} onAmendChange={p.onAmendChange}
        onCommit={p.onCommit} />
    </div>
  );
}
