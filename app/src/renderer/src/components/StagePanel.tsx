import { STAGE_NAMES, STAGE_LABELS, type ProjectInfo, type StageName } from '../../../shared/types';

interface Props {
  project: ProjectInfo | null;
  onRebuild: () => void;
  onOpenDoc: (relPath: string) => void;
}

export function StagePanel({ project, onRebuild, onOpenDoc }: Props) {
  if (!project) return <div className="muted">選擇或建立一個專案</div>;
  if (!project.state) {
    return (
      <div className="stage-broken">
        <span className="error">狀態未知{project.stateError ? `：${project.stateError}` : ''}</span>{' '}
        <button onClick={onRebuild}>重建 state</button>
      </div>
    );
  }
  const s = project.state;
  const current: StageName | null = s.stage === 'done' ? null : s.stage;
  const docs = current ? s.stages[current].docs ?? [] : [];
  return (
    <div className="stage-body">
      <div className="stages">
        {STAGE_NAMES.map((st) => (
          <span key={st} className={`chip ${s.stages[st].status}`} title={s.stages[st].reason ?? s.stages[st].commit ?? ''}>
            {STAGE_LABELS[st]}
          </span>
        ))}
        <span className="muted meta">
          {project.name} · {s.type} · issue：{s.issues.length}
          {s.stage === 'done' ? ' · 已完成' : ''}
        </span>
      </div>
      <div className="docs">
        {docs.length === 0 && <span className="muted">目前階段尚無文件</span>}
        {docs.map((d) => <button key={d} className="doc" onClick={() => onOpenDoc(d)}>{d}</button>)}
      </div>
    </div>
  );
}
