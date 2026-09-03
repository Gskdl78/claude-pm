import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { InsightItem, InsightsReport, PinnedNote, PmIssue } from '../shared/types';
import { listProjects } from './projects';

/** 讀 root 下每個已初始化專案的 issues；state 壞掉的專案記進 skipped。 */
export function collectInsights(root: string): InsightsReport {
  const items: InsightItem[] = [];
  const skipped: string[] = [];
  let projects = 0;
  for (const p of listProjects(root)) {
    if (!p.initialized) continue;
    if (!p.state) { skipped.push(p.name); continue; }
    projects += 1;
    for (const raw of p.state.issues ?? []) {
      const i = raw as Partial<PmIssue>;
      items.push({
        id: typeof i.id === 'number' ? i.id : 0,
        stage: (i.stage ?? 'build') as PmIssue['stage'],
        task: typeof i.task === 'string' ? i.task : null,
        symptom: String(i.symptom ?? ''), cause: String(i.cause ?? ''), fix: String(i.fix ?? ''),
        commit: String(i.commit ?? ''), at: String(i.at ?? ''),
        project: p.state.name || p.name, path: p.path,
      });
    }
  }
  return { items, projects, skipped };
}

// 釘選檔每行：- <根因> → 建議：<修法>
const LINE_RE = /^- (.+?) → 建議：(.*)$/;
const SEP = ' → 建議：';
const MAX_LEN = 500;

export function parsePinned(text: string): PinnedNote[] {
  const out: PinnedNote[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = LINE_RE.exec(line.trim());
    if (m) out.push({ cause: m[1]!.trim(), fix: m[2]!.trim() });
  }
  return out;
}

export function formatPinned(notes: PinnedNote[]): string {
  return notes.map((n) => `- ${n.cause}${SEP}${n.fix}\n`).join('');
}

export function readPinned(file: string): PinnedNote[] {
  if (!existsSync(file)) return [];
  try { return parsePinned(readFileSync(file, 'utf8')); } catch { return []; }
}

export function writePinned(file: string, notes: PinnedNote[]): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, formatPinned(notes), 'utf8');
}

const norm = (s: string) => s.trim().toLowerCase();

/** 同根因（trim、不分大小寫）就覆蓋原位置，否則加到末尾。 */
export function pinNote(notes: PinnedNote[], note: PinnedNote): PinnedNote[] {
  const clean = { cause: note.cause.trim(), fix: note.fix.trim() };
  const idx = notes.findIndex((n) => norm(n.cause) === norm(clean.cause));
  if (idx === -1) return [...notes, clean];
  return notes.map((n, i) => (i === idx ? clean : n));
}

export function unpinNote(notes: PinnedNote[], cause: string): PinnedNote[] {
  return notes.filter((n) => norm(n.cause) !== norm(cause));
}

function field(v: unknown): string {
  if (typeof v !== 'string') throw new Error('invalid note');
  const s = v.trim();
  if (s.length === 0 || s.length > MAX_LEN || /[\r\n]/.test(s) || s.includes(SEP)) throw new Error('invalid note');
  return s;
}

/** renderer 傳來的 note 是不可信輸入：兩個欄位都要單行、1–500 字，且不含分隔字串。 */
export function assertNote(v: unknown): PinnedNote {
  if (!v || typeof v !== 'object') throw new Error('invalid note');
  const o = v as Record<string, unknown>;
  return { cause: field(o.cause), fix: field(o.fix) };
}
