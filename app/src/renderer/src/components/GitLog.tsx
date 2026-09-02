import type { GitCommit } from '../../../shared/types';

export function GitLog({ commits }: { commits: GitCommit[] }) {
  if (commits.length === 0) return <div className="muted">尚無 commit</div>;
  return (
    <div className="commits">
      {commits.map((c) => (
        <div key={c.hash} className="commit">
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
