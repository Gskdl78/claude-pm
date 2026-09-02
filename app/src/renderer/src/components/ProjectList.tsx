import type { ProjectInfo } from '../../../shared/types';

interface Props {
  projects: ProjectInfo[];
  currentPath: string | null;
  onSelect: (p: ProjectInfo) => void;
  onInit: (p: ProjectInfo) => void;
  onNew: () => void;
}

export function ProjectList({ projects, currentPath, onSelect, onInit, onNew }: Props) {
  return (
    <div>
      <button onClick={onNew} style={{ width: '100%', marginBottom: 8 }}>+ 新專案</button>
      {projects.length === 0 && <div className="muted">尚無專案</div>}
      {projects.map((p) => (
        <div key={p.path} className={`project${p.path === currentPath ? ' active' : ''}`} onClick={() => onSelect(p)}>
          <span>{p.name}</span>
          {!p.initialized && (
            <span>
              <span className="badge">未初始化 </span>
              <button onClick={(e) => { e.stopPropagation(); onInit(p); }}>初始化</button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
