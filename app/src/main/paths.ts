import { resolve, sep } from 'node:path';

function norm(p: string): string {
  const r = resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

/** 確認 target 位於 root 之內（含 root 本身），回傳正規化後的 target。 */
export function assertInsideRoot(root: string, target: string): string {
  const r = norm(root);
  const t = norm(target);
  if (t === r || t.startsWith(r.endsWith(sep) ? r : r + sep)) return resolve(target);
  throw new Error(`path outside root: ${target}`);
}
