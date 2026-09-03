import type { GitCommit } from '../../../../shared/types';

interface Props {
  commits: GitCommit[];
  busy: boolean;
  onShow: (hash: string) => void;
  onRevert: (hash: string) => void;
  /** 交給「進階」分頁填入重設目標並切換過去，模式在那裡選 */
  onResetTo: (hash: string) => void;
  /** 交給「進階」分頁填入標籤目標並切換過去，名稱在那裡輸入 */
  onTag: (hash: string) => void;
}

export function HistoryTab({ commits, busy, onShow, onRevert, onResetTo, onTag }: Props) {
  if (commits.length === 0) return <div className="muted empty">尚無 commit</div>;
  const actions: Array<{ label: string; text: string; onClick: (hash: string) => void }> = [
    { label: '還原提交', text: '還原', onClick: onRevert },
    { label: '重設到此', text: '重設到此', onClick: onResetTo },
    { label: '在此建立標籤', text: '標籤', onClick: onTag },
  ];
  return (
    <div className="commits">
      {commits.map((c) => (
        <div key={c.hash} className="commit" role="button" tabIndex={0} aria-label={`查看提交：${c.hash}`} title="點擊查看這次提交的內容"
          onClick={() => onShow(c.hash)}
          onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onShow(c.hash); }}>
          <div className="line">
            <span className="hash">{c.hash}</span>
            <span className="msg">{c.message}</span>
          </div>
          <div className="date">{new Date(c.date).toLocaleString('zh-TW')}</div>
          {/* 整列是按鈕：小按鈕要擋掉冒泡，否則按「還原」也會開 show */}
          <div className="history-actions">
            {actions.map((a) => (
              <button type="button" key={a.label} className="mini-text" aria-label={`${a.label}：${c.hash}`} title={a.label} disabled={busy}
                onClick={(e) => { e.stopPropagation(); a.onClick(c.hash); }}>
                {a.text}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
