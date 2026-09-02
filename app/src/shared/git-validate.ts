import type { GitAction, GitDiffMode } from './types';

/** git check-ref-format 的子集，另外拒絕 - 開頭（避免被當成選項）。 */
export const BRANCH_RE = /^(?![-./])(?!.*(?:\.\.|@\{|\/\/|\/\.|\.lock$|[\/.]$))[^\s~^:?*\[\\\x00-\x1f\x7f]{1,200}$/;
export const HASH_RE = /^[0-9a-f]{4,40}$/i;
export const MAX_MESSAGE = 10_000;
export const DIFF_MODES: readonly GitDiffMode[] = ['staged', 'unstaged', 'untracked'];

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
    default: throw new Error('invalid action');
  }
}
