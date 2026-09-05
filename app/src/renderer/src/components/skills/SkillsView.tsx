import { useState } from 'react';
import type { SkillFetchResult, SkillInstall, SkillReport, SkillStatus } from '../../../../shared/types';
import { AddSkillDialog } from './AddSkillDialog';
import { SkillPickList } from './SkillPickList';
import { SkillReportView } from './SkillReportView';

export type SkillAction = 'remove-project' | 'remove-global' | 'adopt' | 'promote';

export interface SkillsViewProps {
  /** 與文件、洞察分頁一樣常駐，只切 hidden */
  hidden: boolean;
  projectPath: string | null;
  installs: SkillInstall[];
  busy: boolean;
  /** 終端機閒置時才能送分析提示 */
  canAnalyze: boolean;
  /** 失敗時回 null，白話錯誤由 App 寫進輸出區 */
  onFetch: (source: string) => Promise<SkillFetchResult | null>;
  onInstall: (cacheId: string, name: string, renameTo: string | null) => void;
  onAction: (name: string, action: SkillAction) => void;
  onAnalyze: (prompt: string) => void;
}

const GROUPS: readonly (readonly [SkillStatus, string])[] = [
  ['trial', '試用中'],
  ['adopted', '專案採用'],
  ['global', '全域'],
];

export function SkillsView({ hidden, projectPath, installs, busy, canAnalyze, onFetch, onInstall, onAction, onAnalyze }: SkillsViewProps) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState<{ result: SkillFetchResult; source: string } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const clearFetched = () => { setFetched(null); setPicked(null); };

  const doFetch = async (source: string) => {
    setError(null);
    const r = await onFetch(source);
    if (!r) { setError('取得失敗，詳情看下方輸出。'); return; }
    setAdding(false);
    setFetched({ result: r, source });
    // 只有一個就直接進報告頁，多個才讓使用者挑
    setPicked(r.reports.length === 1 ? r.reports[0]!.name : null);
  };

  if (hidden) return <div hidden />;

  const report: SkillReport | null = fetched && picked
    ? fetched.result.reports.find((r) => r.name === picked) ?? null
    : null;

  if (report && fetched) {
    return (
      <SkillReportView report={report} source={fetched.source} busy={busy} canAnalyze={canAnalyze}
        onAnalyze={onAnalyze}
        onTrial={() => { onInstall(fetched.result.cacheId, report.name, null); clearFetched(); }}
        onBack={() => { if (fetched.result.reports.length === 1) clearFetched(); else setPicked(null); }} />
    );
  }

  if (fetched) {
    return <SkillPickList reports={fetched.result.reports} onPick={setPicked} onCancel={clearFetched} />;
  }

  return (
    <div className="skill-list">
      <div className="row">
        <button disabled={!projectPath || busy} onClick={() => { setError(null); setAdding(true); }}>加入 skill</button>
      </div>
      {!projectPath && <p className="muted">先在左邊開一個專案，skill 會裝進那個專案。</p>}
      {projectPath && installs.length === 0 && <p className="muted">這個專案還沒有從外面加進來的 skill。</p>}

      {GROUPS.map(([status, label]) => {
        const rows = installs.filter((s) => s.status === status);
        if (rows.length === 0) return null;
        return (
          <div key={status}>
            <h4>{label}</h4>
            {rows.map((s) => (
              <div className="skill-row" key={s.name}>
                <span className="name">{s.name}</span>
                <span className={`skill-badge ${s.status}`}>{label}</span>
                {s.needsRestart && <span className="muted">待重啟</span>}
                {s.status === 'trial' && (
                  <button disabled={busy} aria-label={`採用 ${s.name}`} onClick={() => onAction(s.name, 'adopt')}>採用</button>
                )}
                {s.status !== 'global' && (
                  <button disabled={busy} aria-label={`升為全域 ${s.name}`} onClick={() => onAction(s.name, 'promote')}>升為全域</button>
                )}
                <button className="danger" disabled={busy} aria-label={`移除 ${s.name}`}
                  onClick={() => onAction(s.name, s.status === 'global' ? 'remove-global' : 'remove-project')}>移除</button>
              </div>
            ))}
          </div>
        );
      })}

      <AddSkillDialog open={adding} busy={busy} error={error}
        onFetch={(src) => { void doFetch(src); }} onCancel={() => setAdding(false)} />
    </div>
  );
}
