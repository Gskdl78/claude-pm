import { TerminalHost, type SessionState } from './Terminal';
import { DocsTab } from './docs/DocsTab';
import { InsightsView } from './insights/InsightsView';
import { SkillsView, type SkillsViewProps } from './skills/SkillsView';

export type CenterTab = 'terminal' | 'docs' | 'insights' | 'skills';

interface Props {
  tab: CenterTab;
  onTab: (t: CenterTab) => void;
  /** 目前活著（或剛結束）的 session，以專案路徑為鍵 */
  sessions: Record<string, SessionState>;
  /** 使用者正在看的專案；也是終端機顯示的那一個 */
  currentPath: string | null;
  onRestart: (path: string) => void;
  path: string | null;
  stageDocs: string[];
  selectedDoc: string | null;
  onSelectDoc: (rel: string | null) => void;
  docsRevision: number;
  onNotice: (text: string, kind?: 'hint' | 'error') => void;
  /** 任一專案的 state 有變動時 +1，讓洞察分頁在下次顯示時重讀 */
  insightsRevision: number;
  onRevealCommit: (path: string, hash: string) => void;
  /** Skills 分頁的全部 props；hidden 由 CenterPane 自己給 */
  skills: Omit<SkillsViewProps, 'hidden'>;
  /** 設定裡的終端機字型大小 */
  fontSize?: number;
  /** 對話框關閉時遞增，轉給 Terminal 把焦點要回來 */
  focusSeq?: number;
}

/** 中間區域：終端機、文件與洞察三個分頁；三者都常駐，只切換 hidden（xterm 不能卸載）。 */
export function CenterPane({ tab, onTab, sessions, currentPath, onRestart, path, stageDocs, selectedDoc, onSelectDoc, docsRevision, onNotice, fontSize, focusSeq, insightsRevision, onRevealCommit, skills }: Props) {
  const tabButton = (id: CenterTab, label: string) => (
    <button role="tab" aria-selected={tab === id} className={`center-tab${tab === id ? ' active' : ''}`} onClick={() => onTab(id)}>{label}</button>
  );
  return (
    <section className="center">
      <div className="center-tabs" role="tablist">
        {tabButton('terminal', '終端機')}
        {tabButton('docs', '文件')}
        {tabButton('insights', '洞察')}
        {tabButton('skills', 'Skills')}
        {tab === 'docs' && selectedDoc && <span className="muted center-title" title={selectedDoc}>{selectedDoc}</span>}
      </div>
      <div className="center-body">
        <TerminalHost sessions={sessions} currentPath={currentPath} visible={tab === 'terminal'} fontSize={fontSize} focusSeq={focusSeq} onRestart={onRestart} />
        <DocsTab hidden={tab !== 'docs'} path={path} stageDocs={stageDocs} selected={selectedDoc} onSelect={onSelectDoc} docsRevision={docsRevision} onNotice={onNotice} />
        <InsightsView hidden={tab !== 'insights'} revision={insightsRevision} onRevealCommit={onRevealCommit} />
        <SkillsView hidden={tab !== 'skills'} {...skills} />
      </div>
    </section>
  );
}
