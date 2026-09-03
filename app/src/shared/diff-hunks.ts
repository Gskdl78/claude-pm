export interface Hunk { header: string; lines: string[] }
export interface ParsedDiff { fileHeader: string[]; hunks: Hunk[]; binary: boolean; truncated: boolean }

/** clip() 截斷時附加的標記（見 git-run.ts 的 TRUNCATED）；含它就不能逐段操作。 */
const TRUNCATED_MARK = '已截斷';

/** 單檔 diff → 檔頭 + 各 hunk。多檔 diff 只取第一個檔頭（面板只會對單檔開 diff）。 */
export function splitHunks(diff: string): ParsedDiff {
  const out: ParsedDiff = { fileHeader: [], hunks: [], binary: false, truncated: diff.includes(TRUNCATED_MARK) };
  if (!diff) return out;
  const lines = diff.replace(/\n$/, '').split('\n');
  let cur: Hunk | null = null;
  for (const line of lines) {
    if (line.startsWith('@@')) { cur = { header: line, lines: [] }; out.hunks.push(cur); continue; }
    if (cur) { cur.lines.push(line); continue; }
    if (/^Binary files |^GIT binary patch/.test(line)) out.binary = true;
    out.fileHeader.push(line);
  }
  return out;
}

/** 檔頭 + 指定的一段，結尾換行；給 git apply --cached 用。 */
export function buildHunkPatch(parsed: ParsedDiff, index: number): string {
  const h = parsed.hunks[index];
  if (!h) throw new Error(`hunk ${index} not found`);
  return [...parsed.fileHeader, h.header, ...h.lines].join('\n') + '\n';
}
