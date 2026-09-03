import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertNote, collectInsights, formatPinned, parsePinned, pinNote, readPinned, unpinNote, writePinned } from './insights';

function state(name: string, issues: unknown) {
  return JSON.stringify({
    version: 1, name, type: 'web', stage: 'build',
    stages: { env: { status: 'done' }, design: { status: 'done' }, tech: { status: 'done' }, build: { status: 'in_progress' }, verify: { status: 'pending' } },
    issues,
  });
}

describe('collectInsights', () => {
  it('gathers issues from every initialised project and reports skipped ones', () => {
    const root = mkdtempSync(join(tmpdir(), 'pm-ins-'));
    mkdirSync(join(root, 'a', '.pm'), { recursive: true });
    mkdirSync(join(root, 'b', '.pm'), { recursive: true });
    mkdirSync(join(root, 'bad', '.pm'), { recursive: true });
    mkdirSync(join(root, 'plain'));
    writeFileSync(join(root, 'a', '.pm', 'state.json'), state('a', [{ id: 1, stage: 'build', task: 'T1', symptom: 's1', cause: 'c1', fix: 'f1', commit: 'aaa1111', at: '2026-09-01T00:00:00Z' }]));
    writeFileSync(join(root, 'b', '.pm', 'state.json'), state('b', [{ id: 1, stage: 'verify', task: null, symptom: 's2', cause: 'c1', fix: 'f2', commit: 'bbb2222', at: '2026-09-02T00:00:00Z' }, { id: 2, stage: 'build', task: null, symptom: 's3', cause: 'c3', fix: '', commit: '', at: '' }]));
    writeFileSync(join(root, 'bad', '.pm', 'state.json'), '{nope');
    const r = collectInsights(root);
    expect(r.projects).toBe(2);
    expect(r.skipped).toEqual(['bad']);
    expect(r.items.map((i) => [i.project, i.id, i.cause])).toEqual([['a', 1, 'c1'], ['b', 1, 'c1'], ['b', 2, 'c3']]);
    expect(r.items[0]!.path).toBe(join(root, 'a'));
  });
  it('returns an empty report for a missing root', () => {
    expect(collectInsights(join(tmpdir(), 'nope-' + Date.now()))).toEqual({ items: [], projects: 0, skipped: [] });
  });
  it('skips a project whose issues is not an array', () => {
    const root = mkdtempSync(join(tmpdir(), 'pm-ins-'));
    mkdirSync(join(root, 'a', '.pm'), { recursive: true });
    mkdirSync(join(root, 'obj', '.pm'), { recursive: true });
    writeFileSync(join(root, 'a', '.pm', 'state.json'), state('a', [{ id: 1, stage: 'build', task: null, symptom: 's1', cause: 'c1', fix: 'f1', commit: '', at: '' }]));
    writeFileSync(join(root, 'obj', '.pm', 'state.json'), state('obj', {}));
    const r = collectInsights(root);
    expect(r.skipped).toEqual(['obj']);
    expect(r.projects).toBe(1);
    expect(r.items.map((i) => i.cause)).toEqual(['c1']);
  });
  it('skips non-object entries but keeps the valid ones', () => {
    const root = mkdtempSync(join(tmpdir(), 'pm-ins-'));
    mkdirSync(join(root, 'a', '.pm'), { recursive: true });
    writeFileSync(join(root, 'a', '.pm', 'state.json'), state('a', [null, { id: 2, stage: 'build', task: null, symptom: 's2', cause: 'c2', fix: 'f2', commit: '', at: '' }]));
    const r = collectInsights(root);
    expect(r.skipped).toEqual([]);
    expect(r.projects).toBe(1);
    expect(r.items.map((i) => [i.id, i.cause])).toEqual([[2, 'c2']]);
  });
});

describe('pinned notes', () => {
  it('parses and formats bullet lines, ignoring others', () => {
    const text = '# 固定注意事項\n- Env 缺少 .env → 建議：加 .env.example\n\n- Timeout → 建議：加重試；拉長逾時\nnot a bullet\n';
    expect(parsePinned(text)).toEqual([{ cause: 'Env 缺少 .env', fix: '加 .env.example' }, { cause: 'Timeout', fix: '加重試；拉長逾時' }]);
    expect(parsePinned(text.replace(/\n/g, '\r\n'))).toEqual(parsePinned(text));
    expect(formatPinned(parsePinned(text))).toBe('- Env 缺少 .env → 建議：加 .env.example\n- Timeout → 建議：加重試；拉長逾時\n');
    expect(formatPinned([])).toBe('');
  });
  it('pin replaces the same cause case-insensitively and unpin removes it', () => {
    const a = pinNote([], { cause: 'Env 缺少 .env', fix: 'f1' });
    const b = pinNote(a, { cause: 'timeout', fix: 'f2' });
    const c = pinNote(b, { cause: ' ENV 缺少 .env ', fix: 'f3' });
    expect(c).toEqual([{ cause: 'ENV 缺少 .env', fix: 'f3' }, { cause: 'timeout', fix: 'f2' }]);
    expect(unpinNote(c, 'TIMEOUT')).toEqual([{ cause: 'ENV 缺少 .env', fix: 'f3' }]);
    expect(unpinNote(c, 'missing')).toEqual(c);
  });
  it('reads a missing file as [] and round-trips through write', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'pm-pin-')), 'nested', 'pinned-notes.md');
    expect(readPinned(file)).toEqual([]);
    writePinned(file, [{ cause: 'a', fix: 'b' }]);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('- a → 建議：b\n');
    expect(readPinned(file)).toEqual([{ cause: 'a', fix: 'b' }]);
  });
  it('rethrows read errors other than ENOENT', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-pin-'));
    // 釘選路徑上是一個資料夾：不能被當成「沒有釘選」而靜靜回傳 []。
    expect(() => readPinned(dir)).toThrow();
  });
  it('assertNote validates shape, length and single line', () => {
    expect(assertNote({ cause: ' a ', fix: ' b ', extra: 1 })).toEqual({ cause: 'a', fix: 'b' });
    expect(() => assertNote(null)).toThrow(/須為單行/);
    expect(() => assertNote({ cause: 'a' })).toThrow(/須為單行/);
    expect(() => assertNote({ cause: '', fix: 'b' })).toThrow(/須為單行/);
    expect(() => assertNote({ cause: 'a\nb', fix: 'b' })).toThrow(/須為單行/);
    expect(() => assertNote({ cause: 'a', fix: 'x'.repeat(501) })).toThrow(/須為單行/);
    expect(() => assertNote({ cause: 'a → 建議：x', fix: 'b' })).toThrow(/須為單行/);
  });
});
