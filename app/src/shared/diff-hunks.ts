import { TRUNCATED } from './git-text';

export interface Hunk { header: string; lines: string[] }
export interface ParsedDiff { fileHeader: string[]; hunks: Hunk[]; binary: boolean; truncated: boolean }

/**
 * 單檔 diff → 檔頭 + 各 hunk。截斷判斷用 endsWith(TRUNCATED)：diff 內容本身就可能含「已截斷」字樣
 * （例如這個 App 自己的原始碼），用 includes 會把整份 diff 誤判成被截斷而藏掉逐段按鈕。
 * 多檔 diff（面板只會對單檔開 diff）在第二個 diff --git 就停，buildHunkPatch 才不會夾帶別的檔案。
 */
export function splitHunks(diff: string): ParsedDiff {
  const out: ParsedDiff = { fileHeader: [], hunks: [], binary: false, truncated: diff.endsWith(TRUNCATED) };
  if (!diff) return out;
  const lines = diff.replace(/\n$/, '').split('\n');
  let cur: Hunk | null = null;
  for (const [i, line] of lines.entries()) {
    if (i > 0 && line.startsWith('diff --git ')) break;
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
