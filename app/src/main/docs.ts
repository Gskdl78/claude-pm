import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { DocEntry } from '../shared/types';
import { isDocRelPath } from '../shared/docs-path';

export const MAX_DOC_BYTES = 2 * 1024 * 1024;

function docsRoot(dir: string): string { return resolve(dir, 'docs'); }

/** rel 必須是合法的 docs 相對路徑，且解析後仍在 <dir>/docs/ 之下。 */
function resolveDoc(dir: string, rel: string): string {
  if (!isDocRelPath(rel)) throw new Error('invalid doc path');
  const abs = resolve(dir, rel);
  if (!abs.startsWith(docsRoot(dir) + sep)) throw new Error('invalid doc path');
  return abs;
}

/** 遞迴列出 docs/**\/*.md；略過 . 開頭與 node_modules 目錄；依 rel 排序。docs/ 不存在回 []。 */
export function listDocs(dir: string): DocEntry[] {
  const root = docsRoot(dir);
  if (!existsSync(root)) return [];
  const out: DocEntry[] = [];
  const walk = (abs: string, rel: string) => {
    let entries: import('node:fs').Dirent[];
    try { entries = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        walk(join(abs, e.name), childRel);
      } else if (e.isFile() && /\.md$/i.test(e.name)) {
        try {
          const s = statSync(join(abs, e.name));
          out.push({ rel: `docs/${childRel}`, size: s.size, mtimeMs: s.mtimeMs });
        } catch { /* 列舉途中被刪除 */ }
      }
    }
  };
  walk(root, '');
  out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return out;
}

export function readDoc(dir: string, rel: string): string {
  const abs = resolveDoc(dir, rel);
  const s = statSync(abs);
  if (!s.isFile()) throw new Error('doc not found');
  if (s.size > MAX_DOC_BYTES) throw new Error('doc too large');
  return readFileSync(abs, 'utf8');
}

/** 只能覆寫既有檔案（不建立新檔）；先寫 .tmp 再 rename，避免寫到一半被讀到。 */
export function writeDoc(dir: string, rel: string, content: string): void {
  const abs = resolveDoc(dir, rel);
  if (typeof content !== 'string') throw new Error('invalid content');
  if (Buffer.byteLength(content, 'utf8') > MAX_DOC_BYTES) throw new Error('doc too large');
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error('doc not found');
  const tmp = `${abs}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, abs);
}

/** watcher 用：所有 md 的 rel:mtime:size 串接，任何新增 / 刪除 / 修改都會改變。 */
export function docsSignature(dir: string): string {
  return listDocs(dir).map((d) => `${d.rel}:${d.mtimeMs}:${d.size}`).join('|');
}
