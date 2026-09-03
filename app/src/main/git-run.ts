import { execFile } from 'node:child_process';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { join } from 'node:path';
import type { GitBranches, GitDiffMode, GitExtras, GitFileChange, GitResult, GitStatus } from '../shared/types';
import { formatGitCommand } from '../shared/git-actions';

export const MAX_TEXT = 512 * 1024;
export const TRUNCATED = '\n…（內容過長，已截斷）';

// core.quotepath=false：非 ASCII 檔名不轉義；color.ui=never：不出色碼。
const BASE_ARGS = ['-c', 'core.quotepath=false', '-c', 'color.ui=never'];

// LC_ALL=C：錯誤訊息固定英文，錯誤對映表才比得到；GIT_TERMINAL_PROMPT=0：沒有 tty 時不等帳密，直接失敗；
// GIT_OPTIONAL_LOCKS=0：輪詢 status 不搶 index.lock，不干擾終端機裡的 git。process.env 在呼叫時展開，
// 測試才能在 beforeAll 設定作者。
export function gitEnv(): NodeJS.ProcessEnv {
  return { ...process.env, LC_ALL: 'C', LANG: 'C', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
}

/** execFile 共用：永不 reject，spawn 失敗（找不到程式）以 code 127 回報，stderr 附上錯誤訊息。 */
export function capture(exe: string, argv: string[], dir: string, env: NodeJS.ProcessEnv, command: string): Promise<GitResult> {
  return new Promise((done) => {
    execFile(
      exe,
      argv,
      { cwd: dir, env, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (!err) { done({ ok: true, code: 0, stdout, stderr, command }); return; }
        const c = (err as { code?: unknown }).code;
        const code = typeof c === 'number' ? c : 127;
        const extra = typeof c === 'number' ? '' : `\n${err.message}`;
        done({ ok: false, code, stdout, stderr: `${stderr}${extra}`.trim(), command });
      },
    );
  });
}

/** 執行 git；永不 reject，結果以 ok / code / stdout / stderr 回報。 */
export function runGit(dir: string, args: string[]): Promise<GitResult> {
  return capture('git', [...BASE_ARGS, ...args], dir, gitEnv(), formatGitCommand(args));
}

export function isRepo(dir: string): boolean {
  return existsSync(join(dir, '.git'));
}

export async function hasHead(dir: string): Promise<boolean> {
  return (await runGit(dir, ['rev-parse', '--verify', '--quiet', 'HEAD'])).ok;
}

export type ParsedStatus = Pick<GitStatus, 'branch' | 'detached' | 'noCommits' | 'upstream' | 'ahead' | 'behind' | 'files'>;

function parseHeader(header: string, out: ParsedStatus): void {
  let s = header;
  const initial = /^(?:No commits yet on|Initial commit on) (.+)$/.exec(s);
  if (initial) { out.noCommits = true; s = initial[1]; }
  if (s.startsWith('HEAD (no branch)')) { out.detached = true; out.branch = 'HEAD'; return; }
  const m = /^(.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/.exec(s);
  if (!m) { out.branch = s; return; }
  out.branch = m[1];
  out.upstream = m[2] ?? null;
  const ahead = /ahead (\d+)/.exec(m[3] ?? '');
  const behind = /behind (\d+)/.exec(m[3] ?? '');
  out.ahead = ahead ? Number(ahead[1]) : 0;
  out.behind = behind ? Number(behind[1]) : 0;
}

function change(index: string, work: string, path: string, origPath?: string): GitFileChange {
  const untracked = index === '?' && work === '?';
  const conflicted = index === 'U' || work === 'U' || (index === 'A' && work === 'A') || (index === 'D' && work === 'D');
  return {
    path,
    ...(origPath ? { origPath } : {}),
    index,
    work,
    staged: !untracked && !conflicted && index !== ' ',
    unstaged: !untracked && !conflicted && work !== ' ',
    untracked,
    conflicted,
  };
}

/** 解析 `git status --porcelain=v1 -b -z`：NUL 分隔、不轉義；rename 為「新路徑 NUL 舊路徑」。 */
export function parseStatus(raw: string): ParsedStatus {
  const out: ParsedStatus = { branch: '', detached: false, noCommits: false, upstream: null, ahead: 0, behind: 0, files: [] };
  const tokens = raw.split('\0');
  let i = 0;
  if (tokens[0]?.startsWith('## ')) { parseHeader(tokens[0].slice(3), out); i = 1; }
  for (; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.length < 4) continue;
    const index = t[0];
    const work = t[1];
    const path = t.slice(3);
    let origPath: string | undefined;
    if (index === 'R' || index === 'C' || work === 'R' || work === 'C') { i += 1; origPath = tokens[i]; }
    out.files.push(change(index, work, path, origPath));
  }
  return out;
}

const NOT_A_REPO: GitStatus = {
  isRepo: false, branch: '', detached: false, noCommits: true, upstream: null,
  ahead: 0, behind: 0, hasRemote: false, merging: false, files: [],
};

export async function getStatus(dir: string): Promise<GitStatus> {
  if (!isRepo(dir)) return { ...NOT_A_REPO, files: [] };
  const [st, remotes] = await Promise.all([
    runGit(dir, ['status', '--porcelain=v1', '-b', '-z']),
    runGit(dir, ['remote']),
  ]);
  if (!st.ok) throw new Error(st.stderr || `git status failed (${st.code})`);
  return {
    isRepo: true,
    ...parseStatus(st.stdout),
    hasRemote: remotes.stdout.trim().length > 0,
    merging: existsSync(join(dir, '.git', 'MERGE_HEAD')),
  };
}

/** 只列本地分支（字母序）；分離 HEAD 的 "(HEAD detached at …)" 列會被略過。 */
export async function getBranches(dir: string): Promise<GitBranches> {
  if (!isRepo(dir)) return { current: '', all: [] };
  const r = await runGit(dir, ['branch', '--format=%(HEAD) %(refname:short)']);
  if (!r.ok) throw new Error(r.stderr);
  let current = '';
  const all: string[] = [];
  for (const line of r.stdout.split('\n')) {
    if (line.length < 3) continue;
    const name = line.slice(2).trim();
    if (name.startsWith('(')) continue;
    all.push(name);
    if (line[0] === '*') current = name;
  }
  return { current, all };
}

function clip(text: string): string {
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + TRUNCATED : text;
}

const UNREADABLE = '（無法讀取檔案）';

/** 只讀開頭 MAX_TEXT + 1 個位元組：多的那一個是給 clip 判斷「有沒有被截斷」用的。 */
function readHead(full: string, size: number): Buffer {
  if (size <= MAX_TEXT) return readFileSync(full);
  const buf = Buffer.alloc(MAX_TEXT + 1);
  const fd = openSync(full, 'r');
  try {
    return buf.subarray(0, readSync(fd, buf, 0, buf.length, 0));
  } finally {
    closeSync(fd);
  }
}

/**
 * 未追蹤檔沒有 diff 可看，改顯示內容；路徑已由 handler 驗證為 repo 內相對路徑。
 * 大檔只讀開頭，不整份載入記憶體；symlink 與 .git 內的檔案一律不讀。
 */
function readUntracked(dir: string, file: string): string {
  const full = join(dir, file);
  try {
    if (file.split(/[\\/]/)[0]?.toLowerCase() === '.git') return UNREADABLE;
    const st = lstatSync(full);
    if (st.isSymbolicLink()) return UNREADABLE;
    if (st.isDirectory()) return '（新資料夾）';
    if (!st.isFile()) return UNREADABLE;
    const buf = readHead(full, st.size);
    if (buf.subarray(0, 8000).includes(0)) return '（二進位檔案）';
    return clip(`（新檔案）\n${buf.toString('utf8')}`);
  } catch {
    return UNREADABLE;
  }
}

export async function getDiff(dir: string, file: string, mode: GitDiffMode): Promise<string> {
  if (mode === 'untracked') return readUntracked(dir, file);
  const args = mode === 'staged' ? ['diff', '--cached', '--', file] : ['diff', '--', file];
  const r = await runGit(dir, args);
  if (!r.ok) throw new Error(r.stderr);
  return clip(r.stdout);
}

export async function showCommit(dir: string, hash: string): Promise<string> {
  const r = await runGit(dir, ['show', '--stat', '--patch', hash, '--']);
  if (!r.ok) throw new Error(r.stderr);
  return clip(r.stdout);
}

/** 收藏清單（列序 = stash@{n} 的 n）與標籤（新到舊）；只在「進階」分頁需要時讀。 */
export async function getExtras(dir: string): Promise<GitExtras> {
  if (!isRepo(dir)) return { stashes: [], tags: [] };
  const [st, tg] = await Promise.all([
    runGit(dir, ['stash', 'list', '--format=%s']),
    runGit(dir, ['tag', '--list', '--sort=-creatordate']),
  ]);
  const stashes = st.ok ? st.stdout.split('\n').filter((l) => l.length > 0).map((message, index) => ({ index, message })) : [];
  const tags = tg.ok ? tg.stdout.split('\n').map((l) => l.trim()).filter((l) => l.length > 0) : [];
  return { stashes, tags };
}
