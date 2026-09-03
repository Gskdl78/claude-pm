import { STAGE_LABELS, type ProjectInfo } from '../../../shared/types';

interface Props {
  projects: ProjectInfo[];
  currentPath: string | null;
  /** 有 pty session 活著的專案 */
  livePaths: ReadonlySet<string>;
  /** Claude Code 正在等使用者輸入的專案 */
  waitingPaths: ReadonlySet<string>;
  onSelect: (p: ProjectInfo) => void;
  onInit: (p: ProjectInfo) => void;
  onNew: () => void;
  /** 打開跨專案洞察分頁 */
  onInsights: () => void;
  /** 關掉這個專案的 session（不切換專案） */
  onCloseSession: (p: ProjectInfo) => void;
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

export function ProjectList({ projects, currentPath, livePaths, waitingPaths, onSelect, onInit, onNew, onInsights, onCloseSession }: Props) {
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
            {waitingPaths.has(p.path)
              ? <span className="pill waiting">● 等待回覆</span>
              : livePaths.has(p.path) && <span className="pill live">● 執行中</span>}
            {livePaths.has(p.path) && (
              <button className="ghost close-session" aria-label="關閉 session" title="關閉 session" onClick={(e) => { e.stopPropagation(); onCloseSession(p); }}>×</button>
            )}
          </span>
        </div>
      ))}
      <button className="insights-entry" onClick={onInsights}>📊 洞察</button>
    </div>
  );
}
