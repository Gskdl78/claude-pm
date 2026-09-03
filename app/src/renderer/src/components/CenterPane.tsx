import { Terminal } from './Terminal';
import { DocsTab } from './docs/DocsTab';

export type CenterTab = 'terminal' | 'docs';

interface Props {
  tab: CenterTab;
  onTab: (t: CenterTab) => void;
  status: 'idle' | 'running' | 'exited';
  launchSeq: number;
  onRestart: () => void;
  path: string | null;
  stageDocs: string[];
  selectedDoc: string | null;
  onSelectDoc: (rel: string | null) => void;
  docsRevision: number;
  onNotice: (text: string, kind?: 'hint' | 'error') => void;
}

/** 中間區域：終端機與文件兩個分頁；兩者都常駐，只切換 hidden（xterm 不能卸載）。 */
export function CenterPane({ tab, onTab, status, launchSeq, onRestart, path, stageDocs, selectedDoc, onSelectDoc, docsRevision, onNotice }: Props) {
  const tabButton = (id: CenterTab, label: string) => (
    <button role="tab" aria-selected={tab === id} className={`center-tab${tab === id ? ' active' : ''}`} onClick={() => onTab(id)}>{label}</button>
  );
  return (
    <section className="center">
      <div className="center-tabs" role="tablist">
        {tabButton('terminal', '終端機')}
        {tabButton('docs', '文件')}
        {tab === 'docs' && selectedDoc && <span className="muted center-title" title={selectedDoc}>{selectedDoc}</span>}
      </div>
      <div className="center-body">
        <Terminal visible={tab === 'terminal'} status={status} launchSeq={launchSeq} onRestart={onRestart} />
        <DocsTab hidden={tab !== 'docs'} path={path} stageDocs={stageDocs} selected={selectedDoc} onSelect={onSelectDoc} docsRevision={docsRevision} onNotice={onNotice} />
      </div>
    </section>
  );
}
