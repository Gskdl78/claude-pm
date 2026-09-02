import type { GitCommit } from '../../../shared/types';

export function GitLog({ commits }: { commits: GitCommit[] }) {
  if (commits.length === 0) return <div className="muted">尚無 commit</div>;
  return (
    <div>
      {commits.map((c) => (
        <div key={c.hash} className="commit">
          <span className="hash">{c.hash}</span>
          <span>{c.message}</span>
          <div className="date">{new Date(c.date).toLocaleString('zh-TW')}</div>
        </div>
      ))}
    </div>
  );
}
