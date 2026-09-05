import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import type { SkillSource } from '../shared/types';
import { parseSkillSource } from '../shared/skill-url';
import { explainGitError } from '../shared/git-errors';
import { TIMED_OUT, runGit } from './git-run';
import { CLONE_TIMEOUT_MS } from './projects';
import { assertInsideRoot } from './paths';

export function skillCacheRoot(home: string = homedir()): string {
  return join(home, '.claude-pm', 'skill-cache');
}

export function cacheIdFor(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, 16);
}

/** cacheId → 掃描根目錄。renderer 只拿得到 id，路徑留在主程序。 */
const roots = new Map<string, string>();

export function cacheRootFor(cacheId: string): string | null {
  return roots.get(cacheId) ?? null;
}

function localRoot(src: Extract<SkillSource, { kind: 'local' }>): string {
  try {
    if (isAbsolute(src.path) && statSync(src.path).isDirectory()) return src.path;
  } catch { /* 讀不到就當不存在 */ }
  throw new Error('invalid skill source');
}

async function cloneRoot(src: Extract<SkillSource, { kind: 'repo' }>, home: string): Promise<string> {
  const cacheRoot = skillCacheRoot(home);
  const dir = join(cacheRoot, cacheIdFor(src.url + (src.ref ?? '')));
  mkdirSync(cacheRoot, { recursive: true });
  // 上一次的殘留會被當成這一次的內容，先整個刪掉
  rmSync(dir, { recursive: true, force: true });
  const args = ['clone', '--depth', '1', ...(src.ref ? ['--branch', src.ref] : []), '--', src.url, dir];
  const r = await runGit(cacheRoot, args, { timeout: CLONE_TIMEOUT_MS });
  if (r.stderr.startsWith(TIMED_OUT)) throw new Error('取得逾時（超過 10 分鐘）已中止：請確認網路連線與倉庫大小後再試。');
  if (!r.ok) throw new Error(explainGitError(`${r.stdout}\n${r.stderr}`) ?? (r.stderr.trim() || 'git clone 失敗'));
  if (!src.subpath) return dir;
  const sub = assertInsideRoot(dir, join(dir, src.subpath));
  if (!existsSync(sub)) throw new Error('no skill found');
  return sub;
}

/** 解析來源 → 取得掃描根目錄，並登記 cacheId 供之後的安裝使用。 */
export async function fetchSkillSource(raw: string, home: string = homedir()): Promise<{ cacheId: string; root: string }> {
  const src = parseSkillSource(raw);
  const root = src.kind === 'local' ? localRoot(src) : await cloneRoot(src, home);
  const cacheId = cacheIdFor(raw);
  roots.set(cacheId, root);
  return { cacheId, root };
}
