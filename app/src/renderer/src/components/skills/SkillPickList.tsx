import type { SkillReport } from '../../../../shared/types';

interface Props {
  reports: SkillReport[];
  onPick: (name: string) => void;
  onCancel: () => void;
}

export function SkillPickList({ reports, onPick, onCancel }: Props) {
  return (
    <div className="skill-list">
      <button className="link" onClick={onCancel}>← 回清單</button>
      <h3>這個來源裡有 {reports.length} 個 skill</h3>
      <p className="muted">選一個看它的掃描報告；試用是一個一個來的。</p>
      {reports.map((r) => (
        <div className="skill-row" key={r.name}>
          <span className="name">{r.name}</span>
          <span className="muted">{r.description}</span>
          <button onClick={() => onPick(r.name)} aria-label={`查看 ${r.name}`}>查看</button>
        </div>
      ))}
    </div>
  );
}
