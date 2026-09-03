/** docs/**\/*.md 的相對路徑：正斜線、無空片段與 . / ..、不可絕對或含磁碟機、.md 結尾（不分大小寫）。 */
export function isDocRelPath(rel: unknown): rel is string {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 4096) return false;
  if (rel.includes('\\') || rel.includes('\0')) return false;
  if (rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) return false;
  const parts = rel.split('/');
  if (parts.length < 2 || parts[0] !== 'docs') return false;
  if (parts.some((s) => s === '' || s === '.' || s === '..')) return false;
  return /\.md$/i.test(parts[parts.length - 1]!);
}

/**
 * 以 fromRel 所在目錄解析 href，回傳 repo 相對路徑（正斜線）。
 * 外部網址、mailto、純錨點、協定相對（//）、跳出 repo 根目錄都回 null。
 */
export function resolveRelPath(fromRel: string, href: string): string | null {
  if (!href) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//')) return null;
  const clean = href.split('#')[0]!.split('?')[0]!;
  if (!clean) return null;
  const out = clean.startsWith('/') ? [] : fromRel.split('/').slice(0, -1);
  for (const s of clean.replace(/^\/+/, '').split('/')) {
    if (s === '' || s === '.') continue;
    if (s === '..') { if (out.length === 0) return null; out.pop(); continue; }
    out.push(s);
  }
  return out.length === 0 ? null : out.join('/');
}

export function resolveDocLink(fromRel: string, href: string): string | null {
  const rel = resolveRelPath(fromRel, href);
  return rel !== null && isDocRelPath(rel) ? rel : null;
}
