import type { InsightGroup, InsightItem, InsightsFilter } from './types';

/** 與 plugin summarizeHistory 同一規則：根因優先，其次症狀；trim + 小寫；空字串代表略過。 */
export function groupKey(item: { cause: string; symptom: string }): string {
  return (item.cause || item.symptom || '').trim().toLowerCase();
}

const WINDOW_MS = { '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 } as const;

function within(at: string, since: InsightsFilter['since'], now: Date): boolean {
  if (since === 'all') return true;
  const t = Date.parse(at);
  if (Number.isNaN(t)) return true;   // 無法解析的時間不當作過期
  return now.getTime() - t <= WINDOW_MS[since];
}

function byAtDesc(a: InsightItem, b: InsightItem): number {
  const ta = Date.parse(a.at); const tb = Date.parse(b.at);
  return (Number.isNaN(tb) ? 0 : tb) - (Number.isNaN(ta) ? 0 : ta);
}

export function groupIssues(items: InsightItem[], filter: InsightsFilter, now: Date = new Date()): InsightGroup[] {
  const groups = new Map<string, InsightGroup>();
  for (const i of items) {
    if (filter.stage !== 'all' && i.stage !== filter.stage) continue;
    if (!within(i.at, filter.since, now)) continue;
    const key = groupKey(i);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) { g = { key, cause: (i.cause || i.symptom).trim(), count: 0, projects: [], fixes: [], items: [] }; groups.set(key, g); }
    g.count += 1;
    if (!g.projects.includes(i.project)) g.projects.push(i.project);
    const fix = i.fix?.trim();
    if (fix && !g.fixes.includes(fix)) g.fixes.push(fix);
    g.items.push(i);
  }
  const out = [...groups.values()];
  for (const g of out) g.items.sort(byAtDesc);
  out.sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause, 'zh-Hant'));
  return out;
}
