import type { GitAction, GitDiffMode, GitResetMode } from './types';

/** git check-ref-format 的子集，另外拒絕 - 開頭（避免被當成選項）。 */
export const BRANCH_RE = /^(?![-./])(?!.*(?:\.\.|@\{|\/\/|\/\.|\.lock$|[\/.]$))[^\s~^:?*\[\\\x00-\x1f\x7f]{1,200}$/;
export const HASH_RE = /^[0-9a-f]{4,40}$/i;
export const MAX_MESSAGE = 10_000;
export const DIFF_MODES: readonly GitDiffMode[] = ['staged', 'unstaged', 'untracked'];
export const RESET_MODES_LIST: readonly GitResetMode[] = ['soft', 'mixed', 'hard'];
/** HEAD~1–HEAD~999 或 hash；不收分支名，reset 的目標永遠不會像選項或任意字串。 */
export const RESET_TARGET_RE = /^(?:HEAD~[1-9]\d{0,2}|[0-9a-fA-F]{4,40})$/;
/** 只收 https:// 與 git@host:owner/repo(.git)：拒絕空白、控制字元、; 與內嵌帳密；git@ 的 host 不可以 - 開頭（避免被當成選項）。 */
export const REMOTE_URL_RE = /^(?:https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?\/[A-Za-z0-9._\/-]+|git@(?!-)[A-Za-z0-9.-]+:[A-Za-z0-9._\/-]+)$/;
export const MAX_URL = 2048;
/** 核定的 [A-Za-z0-9._-]{1,100} 再拒絕 - 開頭：名稱是 gh repo create 的位置參數。 */
export const REPO_NAME_RE = /^(?!-)[A-Za-z0-9._-]{1,100}$/;
export const MAX_STASH_INDEX = 999;
export const MAX_STASH_MESSAGE = 200;
/** 逐 hunk 暫存的 patch 上限；diff 本身已被 clip 在 512 KB，超過就不是面板切出來的。 */
export const MAX_PATCH = 1024 * 1024;

function str(v: unknown, what: string): string {
  if (typeof v !== 'string' || v.length === 0 || v.includes('\0')) throw new Error(`invalid ${what}`);
  return v;
}

/** repo 內的相對路徑：不可絕對、不可含 ..、不可以 - 開頭、不可有中間空段。允許結尾 /（未追蹤資料夾）。 */
export function assertRelPath(v: unknown): string {
  const p = str(v, 'path');
  if (p.length > 4096) throw new Error('invalid path');
  if (/^[A-Za-z]:/.test(p) || p.startsWith('/') || p.startsWith('\\') || p.startsWith('-')) throw new Error('invalid path');
  const parts = p.split(/[\\/]/);
  if (parts.some((s, i) => s === '..' || (s === '' && i !== parts.length - 1))) throw new Error('invalid path');
  return p;
}

export const MAX_COMMIT_PATHS = 100;

/** 1..MAX_COMMIT_PATHS 個 repo 相對路徑；每個都經 assertRelPath。 */
export function assertRelPaths(v: unknown): string[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_COMMIT_PATHS) throw new Error('invalid paths');
  return v.map(assertRelPath);
}

export function assertBranch(v: unknown): string {
  const b = str(v, 'branch name');
  if (!BRANCH_RE.test(b)) throw new Error('invalid branch name');
  return b;
}

export function assertHash(v: unknown): string {
  const h = str(v, 'hash');
  if (!HASH_RE.test(h)) throw new Error('invalid hash');
  return h;
}

export function assertMessage(v: unknown): string {
  const m = str(v, 'message');
  if (m.trim().length === 0 || m.length > MAX_MESSAGE) throw new Error('invalid message');
  return m;
}

export function assertDiffMode(v: unknown): GitDiffMode {
  if (!DIFF_MODES.includes(v as GitDiffMode)) throw new Error('invalid diff mode');
  return v as GitDiffMode;
}

export function assertResetTarget(v: unknown): string {
  const t = str(v, 'reset target');
  if (!RESET_TARGET_RE.test(t)) throw new Error('invalid reset target');
  return t;
}

export function assertResetMode(v: unknown): GitResetMode {
  if (!RESET_MODES_LIST.includes(v as GitResetMode)) throw new Error('invalid reset mode');
  return v as GitResetMode;
}

export function assertStashIndex(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_STASH_INDEX) throw new Error('invalid stash index');
  return v;
}

/** 選填：null / undefined / 空字串都視為沒有說明。 */
export function assertStashMessage(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const m = str(v, 'stash message');
  if (m.trim().length === 0 || m.length > MAX_STASH_MESSAGE || /[\r\n]/.test(m)) throw new Error('invalid stash message');
  return m;
}

export function assertTagName(v: unknown): string {
  const t = str(v, 'tag name');
  if (!BRANCH_RE.test(t)) throw new Error('invalid tag name');
  return t;
}

export function assertRemoteUrl(v: unknown): string {
  const u = str(v, 'remote url');
  if (u.length > MAX_URL || !REMOTE_URL_RE.test(u)) throw new Error('invalid remote url');
  return u;
}

/** REPO_NAME_RE 再拒絕 . 與 ..（避免被當成目前 / 上層目錄）；wizard 用來即時驗證輸入。 */
export function isValidRepoName(name: string): boolean {
  return REPO_NAME_RE.test(name) && name !== '.' && name !== '..';
}

export function assertRepoName(v: unknown): string {
  const n = str(v, 'repo name');
  if (!isValidRepoName(n)) throw new Error('invalid repo name');
  return n;
}

/**
 * 單檔 patch（renderer 由 diff 文字切出的一段）：≤ MAX_PATCH、無 NUL、以 diff --git a/ 開頭；
 * 每個 --- / +++ 路徑只能是 /dev/null 或 a/、b/ 加 repo 相對路徑，避免 patch 指向 repo 外。
 */
export function assertPatch(v: unknown): string {
  const p = str(v, 'patch');
  if (p.length > MAX_PATCH || !p.startsWith('diff --git a/')) throw new Error('invalid patch');
  for (const line of p.split('\n')) {
    const m = /^(---|\+\+\+) (.*)$/.exec(line);
    if (!m) continue;
    const target = m[2]!.replace(/\r$/, '');
    if (target === '/dev/null') continue;
    if (!/^[ab]\//.test(target)) throw new Error('invalid patch');
    assertRelPath(target.slice(2));
  }
  return p;
}

/** renderer 傳來的 action 是不可信輸入：只接受白名單 kind，並重建一個乾淨物件。 */
export function validateGitAction(v: unknown): GitAction {
  if (!v || typeof v !== 'object') throw new Error('invalid action');
  const a = v as Record<string, unknown>;
  switch (a.kind) {
    case 'init': return { kind: 'init' };
    case 'stageAll': return { kind: 'stageAll' };
    case 'unstageAll': return { kind: 'unstageAll' };
    case 'push': return { kind: 'push' };
    case 'pull': return { kind: 'pull' };
    case 'fetch': return { kind: 'fetch' };
    case 'stage': return { kind: 'stage', file: assertRelPath(a.file) };
    case 'unstage': return { kind: 'unstage', file: assertRelPath(a.file) };
    case 'discard': return { kind: 'discard', file: assertRelPath(a.file), untracked: a.untracked === true };
    case 'commit': return { kind: 'commit', message: assertMessage(a.message), amend: a.amend === true };
    case 'switch': return { kind: 'switch', branch: assertBranch(a.branch) };
    case 'createBranch': return { kind: 'createBranch', branch: assertBranch(a.branch) };
    case 'merge': return { kind: 'merge', branch: assertBranch(a.branch) };
    case 'pullRebase': return { kind: 'pullRebase' };
    case 'abortMerge': return { kind: 'abortMerge' };
    case 'stash': return { kind: 'stash', message: assertStashMessage(a.message) };
    case 'stashPop': return { kind: 'stashPop', index: assertStashIndex(a.index) };
    case 'stashDrop': return { kind: 'stashDrop', index: assertStashIndex(a.index) };
    case 'reset': return { kind: 'reset', mode: assertResetMode(a.mode), target: assertResetTarget(a.target) };
    case 'revert': return { kind: 'revert', hash: assertHash(a.hash) };
    case 'tag': return { kind: 'tag', name: assertTagName(a.name), hash: a.hash === null || a.hash === undefined ? null : assertHash(a.hash) };
    case 'deleteTag': return { kind: 'deleteTag', name: assertTagName(a.name) };
    case 'addRemote': return { kind: 'addRemote', url: assertRemoteUrl(a.url) };
    case 'commitPaths': return { kind: 'commitPaths', message: assertMessage(a.message), paths: assertRelPaths(a.paths) };
    case 'applyPatch': return { kind: 'applyPatch', patch: assertPatch(a.patch), reverse: a.reverse === true };
    case 'sync': return { kind: 'sync' };
    default: throw new Error('invalid action');
  }
}
