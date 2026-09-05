import type { SkillSource } from './types';
import { BRANCH_RE, HASH_RE, MAX_URL } from './git-validate';

/** 只收 https:// 與 git@host:owner/repo(.git)；不直接用 REMOTE_URL_RE，那一支允許路徑含 /tree/…。 */
const REPO_URL_RE = /^(?:https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?\/[A-Za-z0-9._/-]+|git@(?!-)[A-Za-z0-9.-]+:[A-Za-z0-9._/-]+)$/;
/** GitHub 網頁的資料夾網址：<repo>/tree/<ref>/<path…>。 */
const TREE_RE = /^(https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)\/tree\/([^/]+)\/(.+)$/;
/** Windows 磁碟機或 POSIX 絕對路徑；UNC（\\host、//host）另外擋掉。 */
const ABS_PATH_RE = /^(?:[A-Za-z]:[\\/]|\/)/;

const MAX_SUBPATH_SEGMENTS = 16;

function bad(): never {
  throw new Error('invalid skill source');
}

/** 每段都不得為空、不得是 . 或 ..、不得含 : 反斜線或 NUL。 */
function assertSubpath(p: string): string {
  const parts = p.split('/');
  if (parts.length > MAX_SUBPATH_SEGMENTS) bad();
  for (const s of parts) {
    if (s === '' || s === '.' || s === '..') bad();
    if (/[\\:\0]/.test(s)) bad();
  }
  return p;
}

export function parseSkillSource(input: unknown): SkillSource {
  if (typeof input !== 'string') bad();
  const v = input.trim();
  if (v.length === 0 || v.length > MAX_URL || v.includes('\0')) bad();
  // UNC 與裝置路徑：主程序 statSync 連不到的主機會卡住，一律先擋
  if (/^[\\/]{2}/.test(v)) bad();

  const tree = TREE_RE.exec(v);
  if (tree) {
    const [, url, ref, subpath] = tree as unknown as [string, string, string, string];
    if (!BRANCH_RE.test(ref) && !HASH_RE.test(ref)) bad();
    return { kind: 'repo', url, ref, subpath: assertSubpath(subpath) };
  }
  if (REPO_URL_RE.test(v)) return { kind: 'repo', url: v, ref: null, subpath: null };
  if (ABS_PATH_RE.test(v)) return { kind: 'local', path: v };
  return bad();
}
