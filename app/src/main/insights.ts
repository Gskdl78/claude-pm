import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    if (!Array.isArray(p.state.issues)) { skipped.push(p.name); continue; }
    // 單一專案的資料再怎麼壞都不能拖垮整份報告：整包收在 try 裡，出錯就整個專案略過。
    const own: InsightItem[] = [];
    try {
      for (const raw of p.state.issues) {
        if (raw === null || typeof raw !== 'object') continue;
        const i = raw as Partial<PmIssue>;
        own.push({
          id: typeof i.id === 'number' ? i.id : 0,
          stage: (i.stage ?? 'build') as PmIssue['stage'],
          task: typeof i.task === 'string' ? i.task : null,
          symptom: String(i.symptom ?? ''), cause: String(i.cause ?? ''), fix: String(i.fix ?? ''),
          commit: String(i.commit ?? ''), at: String(i.at ?? ''),
          project: p.state.name || p.name, path: p.path,
        });
      }
    } catch { skipped.push(p.name); continue; }
    items.push(...own);
    projects += 1;
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

/** 檔案不存在視為空清單；其他錯誤（權限、EISDIR…）要往上拋，不能假裝沒有釘選。 */
export function readPinned(file: string): PinnedNote[] {
  try {
    return parsePinned(readFileSync(file, 'utf8'));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
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

// 這個訊息會直接顯示在洞察頁的釘選錯誤區，所以用中文。
const NOTE_ERROR = '根因與修法須為單行、1–500 字，且不含「 → 建議：」';

function field(v: unknown): string {
  if (typeof v !== 'string') throw new Error(NOTE_ERROR);
  const s = v.trim();
  if (s.length === 0 || s.length > MAX_LEN || /[\r\n]/.test(s) || s.includes(SEP)) throw new Error(NOTE_ERROR);
  return s;
}

/** renderer 傳來的 note 是不可信輸入：兩個欄位都要單行、1–500 字，且不含分隔字串。 */
export function assertNote(v: unknown): PinnedNote {
  if (!v || typeof v !== 'object') throw new Error(NOTE_ERROR);
  const o = v as Record<string, unknown>;
  return { cause: field(o.cause), fix: field(o.fix) };
}
