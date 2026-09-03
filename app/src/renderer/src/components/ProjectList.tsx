import { STAGE_LABELS, type ProjectInfo } from '../../../shared/types';

interface Props {
  projects: ProjectInfo[];
  currentPath: string | null;
  /** Claude Code 正在等這個專案的使用者輸入（只有目前專案會有 pty） */
  waitingPath?: string | null;
  onSelect: (p: ProjectInfo) => void;
  onInit: (p: ProjectInfo) => void;
  onNew: () => void;
  /** 打開跨專案洞察分頁 */
  onInsights: () => void;
}

// The leading dot keeps the pill text distinct from the StagePanel chips, so a
// stage label rendered in both places stays individually addressable in tests.
function stagePill(p: ProjectInfo) {
  if (p.stateError) return <span className="pill blocked">{'● 狀態異常'}</span>;
  if (!p.state) return null;
  const s = p.state;
  if (s.stage === 'done') return <span className="pill done">{'● 已完成'}</span>;
  return <span className={`pill ${s.stages[s.stage].status}`}>{`● ${STAGE_LABELS[s.stage]}`}</span>;
}

export function ProjectList({ projects, currentPath, waitingPath = null, onSelect, onInit, onNew, onInsights }: Props) {
  return (
    <div className="projects">
      <button className="new-project" onClick={onNew}>+ 新專案</button>
      {projects.length === 0 && <div className="muted empty">尚無專案</div>}
      {projects.map((p) => (
        <div
          key={p.path}
          className={`project${p.path === currentPath ? ' active' : ''}`}
          title={p.path}
          onClick={() => onSelect(p)}
        >
          <span className="name">{p.name}</span>
          <span className="status">
            {p.initialized ? stagePill(p) : (
              <>
                <span className="pill warn">未初始化</span>
                <button className="ghost" onClick={(e) => { e.stopPropagation(); onInit(p); }}>初始化</button>
              </>
            )}
            {p.path === waitingPath && <span className="pill waiting">● 等待回覆</span>}
          </span>
        </div>
      ))}
      <button className="insights-entry" onClick={onInsights}>📊 洞察</button>
    </div>
  );
}
