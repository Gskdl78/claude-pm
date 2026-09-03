import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InsightsFilter, InsightsReport, PinnedNote } from '../../../../shared/types';
import { groupIssues } from '../../../../shared/insights-group';
import { pm } from '../../api';
import { errorMessage } from '../../errors';
import { InsightGroupRow } from './InsightGroupRow';

interface Props {
  hidden: boolean;
  /** App 收到任何專案的 state 事件時 +1 */
  revision: number;
  onRevealCommit: (path: string, hash: string) => void;
}

const EMPTY: InsightsReport = { items: [], projects: 0, skipped: [] };
const norm = (s: string) => s.trim().toLowerCase();

export function InsightsView({ hidden, revision, onRevealCommit }: Props) {
  const [report, setReport] = useState<InsightsReport>(EMPTY);
  const [pinned, setPinned] = useState<PinnedNote[]>([]);
  const [filter, setFilter] = useState<InsightsFilter>({ stage: 'all', since: 'all' });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seqRef = useRef(0);
  const pendingRef = useRef(true);

  const load = useCallback(async () => {
    seqRef.current += 1;
    const seq = seqRef.current;
    setLoading(true); setError(null);
    try {
      const [r, p] = await Promise.all([pm.insights.collect(), pm.insights.pinned()]);
      if (seq !== seqRef.current) return;
      setReport(r); setPinned(p);
    } catch (e) {
      if (seq !== seqRef.current) return;
      setError(errorMessage(e));
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  // 隱藏時只記下「需要重讀」，顯示時才真的發 IPC
  useEffect(() => { pendingRef.current = true; }, [revision]);
  useEffect(() => {
    if (hidden || !pendingRef.current) return;
    pendingRef.current = false;
    void load();
  }, [hidden, revision, load]);

  const groups = useMemo(() => groupIssues(report.items, filter), [report, filter]);
  const pinnedKeys = useMemo(() => new Set(pinned.map((n) => norm(n.cause))), [pinned]);

  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const pin = async (cause: string, fixes: string[]) => {
    setBusy(true); setPinError(null);
    try { setPinned(await pm.insights.pin({ cause, fix: fixes.join('；') })); }
    catch (e) { setPinError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const unpin = async (cause: string) => {
    setBusy(true); setPinError(null);
    try { setPinned(await pm.insights.unpin(cause)); }
    catch (e) { setPinError(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="insights" hidden={hidden}>
      <div className="insights-filters">
        <label>階段
          <select aria-label="階段" value={filter.stage} onChange={(e) => setFilter((f) => ({ ...f, stage: e.target.value as InsightsFilter['stage'] }))}>
            <option value="all">全部</option><option value="build">產品實現</option><option value="verify">人工驗證</option>
          </select>
        </label>
        <label>時間
          <select aria-label="時間" value={filter.since} onChange={(e) => setFilter((f) => ({ ...f, since: e.target.value as InsightsFilter['since'] }))}>
            <option value="all">全部</option><option value="7d">最近 7 天</option><option value="30d">最近 30 天</option>
          </select>
        </label>
        <button onClick={() => { void load(); }} disabled={loading}>重新整理</button>
        <span className="muted insights-stats">{report.items.length} 筆 issue · {report.projects} 個專案</span>
        {report.skipped.length > 0 && <span className="error">略過（state 損毀）：{report.skipped.join('、')}</span>}
      </div>
      {error && <div className="error">{error}</div>}
      {loading && <div className="muted">載入中…</div>}
      {!loading && !error && groups.length === 0 && <div className="muted">沒有符合條件的 issue</div>}
      <div className="insight-groups">
        {groups.map((g) => (
          <InsightGroupRow key={g.key} group={g} expanded={expanded.has(g.key)} pinned={pinnedKeys.has(g.key)} busy={busy}
            onToggle={() => toggle(g.key)} onPin={() => { void pin(g.cause, g.fixes); }} onRevealCommit={onRevealCommit} />
        ))}
      </div>
      <section className="pinned-notes" role="region" aria-label="固定注意事項">
        <h3>固定注意事項</h3>
        <div className="muted">之後「+ 新專案」或「初始化」產生的 CLAUDE.md 會帶入這些條目。</div>
        {pinError && <div className="error">{pinError}</div>}
        {pinned.length === 0 && <div className="muted">尚無固定注意事項</div>}
        {pinned.map((n) => (
          <div key={n.cause} className="pinned-note">
            <span>{n.cause} → 建議：{n.fix}</span>
            <button className="ghost" disabled={busy} onClick={() => { void unpin(n.cause); }}>移除</button>
          </div>
        ))}
      </section>
    </div>
  );
}
