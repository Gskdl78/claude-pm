import { STAGE_LABELS, type InsightGroup } from '../../../../shared/types';

interface Props {
  group: InsightGroup;
  expanded: boolean;
  pinned: boolean;
  busy: boolean;
  onToggle: () => void;
  onPin: () => void;
  onRevealCommit: (path: string, hash: string) => void;
}

const MAX_FIXES = 3;

function when(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('zh-TW');
}

export function InsightGroupRow({ group, expanded, pinned, busy, onToggle, onPin, onRevealCommit }: Props) {
  const fixes = group.fixes.slice(0, MAX_FIXES);
  // 沒有任何修法時釘選一定會被 assertNote 擋下，直接停用按鈕。
  const noFix = group.fixes.length === 0;
  return (
    <div className="insight-group">
      <div className="insight-head">
        <button className="ghost" aria-label={expanded ? '收合' : '展開'} onClick={onToggle}>{expanded ? '▾' : '▸'}</button>
        <span className="insight-cause">{group.cause}</span>
        <span className="count">{group.count} 次</span>
        <span className="insight-projects">{group.projects.map((p) => <span key={p} className="pill">{p}</span>)}</span>
        <button disabled={pinned || busy || noFix} title={noFix ? '沒有修法可釘選' : undefined} onClick={onPin}>{pinned ? '已釘選' : '釘選為注意事項'}</button>
      </div>
      {fixes.length > 0 && (
        <div className="insight-fixes muted">
          建議：{fixes.join('；')}{group.fixes.length > MAX_FIXES ? '…' : ''}
        </div>
      )}
      {expanded && (
        <div className="insight-items">
          {group.items.map((i, idx) => (
            <div key={`${i.path}:${i.id}:${idx}`} className="insight-item">
              <span className="pill">{i.project}</span>
              <span className="muted">{STAGE_LABELS[i.stage] ?? i.stage}{i.task ? ` · ${i.task}` : ''}{i.at ? ` · ${when(i.at)}` : ''}</span>
              <span className="insight-symptom">{i.symptom}</span>
              {i.fix && <span className="muted">修法：{i.fix}</span>}
              {i.commit
                ? <button className="ghost" onClick={() => onRevealCommit(i.path, i.commit)}>查看 commit {i.commit.slice(0, 7)}</button>
                : <button className="ghost" disabled>無 commit</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
