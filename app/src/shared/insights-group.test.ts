import { describe, it, expect } from 'vitest';
import { groupIssues, groupKey } from './insights-group';
import type { InsightItem } from './types';

const now = new Date('2026-09-03T12:00:00Z');
function item(over: Partial<InsightItem>): InsightItem {
  return { id: 1, stage: 'build', task: null, symptom: 's', cause: 'c', fix: 'f', commit: 'abc1234', at: '2026-09-02T00:00:00Z', project: 'p', path: 'C:\P\p', ...over };
}

describe('groupKey', () => {
  it('uses cause, falls back to symptom, trims and lowercases', () => {
    expect(groupKey({ cause: '  Env 缺少 .env  ', symptom: 'x' })).toBe('env 缺少 .env');
    expect(groupKey({ cause: '', symptom: 'Timeout' })).toBe('timeout');
    expect(groupKey({ cause: '  ', symptom: '' })).toBe('');
  });
});

describe('groupIssues', () => {
  const items: InsightItem[] = [
    item({ id: 1, cause: 'Env 缺少 .env', fix: '加 .env.example', project: 'a', path: 'C:\P\a', at: '2026-09-01T00:00:00Z' }),
    item({ id: 2, cause: 'env 缺少 .env', fix: '加 .env.example', project: 'b', path: 'C:\P\b', at: '2026-08-01T00:00:00Z', stage: 'verify' }),
    item({ id: 3, cause: 'env 缺少 .env', fix: '文件說明', project: 'a', path: 'C:\P\a', at: '2026-09-03T00:00:00Z' }),
    item({ id: 4, cause: '', symptom: 'Timeout', fix: '加重試', project: 'c', path: 'C:\P\c', at: 'garbage' }),
    item({ id: 5, cause: '', symptom: '', project: 'c', path: 'C:\P\c' }),
  ];

  it('groups by key, counts, dedupes projects and fixes, sorts groups and items', () => {
    const g = groupIssues(items, { stage: 'all', since: 'all' }, now);
    expect(g.map((x) => [x.key, x.count])).toEqual([['env 缺少 .env', 3], ['timeout', 1]]);
    expect(g[0]!.cause).toBe('Env 缺少 .env');
    expect(g[0]!.projects).toEqual(['a', 'b']);
    expect(g[0]!.fixes).toEqual(['加 .env.example', '文件說明']);
    expect(g[0]!.items.map((i) => i.id)).toEqual([3, 1, 2]);
  });

  it('filters by stage', () => {
    const g = groupIssues(items, { stage: 'verify', since: 'all' }, now);
    expect(g).toHaveLength(1);
    expect(g[0]!.count).toBe(1);
    expect(g[0]!.projects).toEqual(['b']);
  });

  it('filters by time window and keeps unparsable dates', () => {
    const g7 = groupIssues(items, { stage: 'all', since: '7d' }, now);
    expect(g7.map((x) => [x.key, x.count])).toEqual([['env 缺少 .env', 2], ['timeout', 1]]);
    const g30 = groupIssues(items, { stage: 'all', since: '30d' }, now);
    expect(g30[0]!.count).toBe(2);
  });

  it('breaks count ties by cause', () => {
    const g = groupIssues([item({ cause: 'b' }), item({ cause: 'a' })], { stage: 'all', since: 'all' }, now);
    expect(g.map((x) => x.cause)).toEqual(['a', 'b']);
  });
});
