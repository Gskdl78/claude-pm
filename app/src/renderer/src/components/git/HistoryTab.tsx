import type { GitCommit } from '../../../../shared/types';

interface Props {
  commits: GitCommit[];
  onShow: (hash: string) => void;
}

export function HistoryTab({ commits, onShow }: Props) {
  if (commits.length === 0) return <div className="muted empty">尚無 commit</div>;
  return (
    <div className="commits">
      {commits.map((c) => (
        <div key={c.hash} className="commit" role="button" tabIndex={0} title="點擊查看這次提交的內容"
          onClick={() => onShow(c.hash)} onKeyDown={(e) => { if (e.key === 'Enter') onShow(c.hash); }}>
          <div className="line">
            <span className="hash">{c.hash}</span>
            <span className="msg">{c.message}</span>
          </div>
          <div className="date">{new Date(c.date).toLocaleString('zh-TW')}</div>
        </div>
      ))}
    </div>
  );
}
