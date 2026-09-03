import type { Settings, ConfigPatch } from './config-schema';
export type { ConfigPatch, ModelName, Settings } from './config-schema';

export type StageName = 'env' | 'design' | 'tech' | 'build' | 'verify';
export const STAGE_NAMES: StageName[] = ['env', 'design', 'tech', 'build', 'verify'];
export const STAGE_LABELS: Record<StageName, string> = {
  env: '環境搭建', design: '產品設計', tech: '技術設計', build: '產品實現', verify: '人工驗證',
};
export type StageStatus = 'pending' | 'in_progress' | 'done' | 'blocked';
export type ProjectType = 'web' | 'cli' | 'library' | 'other';

export interface StageInfo {
  status: StageStatus;
  commit?: string;
  at?: string;
  startedAt?: string;
  docs?: string[];
  reason?: string;
}

export interface PmIssue {
  id: number;
  stage: StageName;
  task: string | null;
  symptom: string;
  cause: string;
  fix: string;
  commit: string;
  at: string;
}

export interface PmState {
  version: 1;
  name: string;
  type: ProjectType;
  stage: StageName | 'done';
  stages: Record<StageName, StageInfo>;
  issues: PmIssue[];
}

export interface ProjectInfo {
  name: string;
  path: string;
  initialized: boolean;
  state: PmState | null;
  stateError?: string;
}

export interface GitCommit {
  hash: string;
  date: string;
  message: string;
}

export interface AppConfig extends Settings {
  root: string;
  lastProject: string | null;
  recent: string[];
}

export interface ClaudeCheck {
  ok: boolean;
  path?: string;
}

export interface PtyStartOptions {
  continue: boolean;
  initialPrompt?: string;
  cols: number;
  rows: number;
}

/** docs/**\/*.md 的一筆；rel 為 repo 相對路徑（正斜線） */
export interface DocEntry { rel: string; size: number; mtimeMs: number }

/** App 要寫進右欄輸出區的一行提示（例如階段切換、清單提交結果）；id 遞增、只增不減 */
export interface Notice { id: number; text: string; kind?: 'hint' | 'error' }

// ---- git panel ----------------------------------------------------------------
export interface GitFileChange {
  path: string;        // repo 相對路徑，git 輸出的正斜線
  origPath?: string;   // rename / copy 的來源
  index: string;       // porcelain X 欄
  work: string;        // porcelain Y 欄
  staged: boolean;     // 非 untracked、非衝突且 X !== ' '
  unstaged: boolean;   // 非 untracked、非衝突且 Y !== ' '
  untracked: boolean;  // '??'
  conflicted: boolean; // X 或 Y 為 U，或 AA / DD
}

export interface GitStatus {
  isRepo: boolean;
  branch: string;          // 分離 HEAD 時為 'HEAD'
  detached: boolean;
  noCommits: boolean;      // 「No commits yet」：HEAD 不存在
  upstream: string | null;
  ahead: number;
  behind: number;
  hasRemote: boolean;
  merging: boolean;        // .git/MERGE_HEAD 存在
  files: GitFileChange[];
}

export interface GitBranches { current: string; all: string[] }

export interface GitResult { ok: boolean; code: number; stdout: string; stderr: string; command: string }

export type GitDiffMode = 'staged' | 'unstaged' | 'untracked';

export type GitResetMode = 'soft' | 'mixed' | 'hard';

export interface GitStash { index: number; message: string }   // index 0 = 最新（stash@{0}）

/** 「進階」分頁才需要、不隨 3 秒輪詢讀取的資料 */
export interface GitExtras { stashes: GitStash[]; tags: string[] }

export interface GhCheck {
  installed: boolean;
  version: string | null;   // `gh --version` 第一行
  authed: boolean;          // `gh auth status` 結束碼為 0
  detail: string;           // auth status 的原始輸出（截斷於 2000 字元），供提示
}

export type PublishChoice =
  | { mode: 'create'; name: string; isPrivate: boolean }
  | { mode: 'url'; url: string };

export type GitAction =
  | { kind: 'init' }
  | { kind: 'stage'; file: string }
  | { kind: 'unstage'; file: string }
  | { kind: 'stageAll' }
  | { kind: 'unstageAll' }
  | { kind: 'discard'; file: string; untracked: boolean }
  | { kind: 'commit'; message: string; amend: boolean }
  | { kind: 'switch'; branch: string }
  | { kind: 'createBranch'; branch: string }
  | { kind: 'merge'; branch: string }
  | { kind: 'push' }
  | { kind: 'pull' }
  | { kind: 'fetch' }
  | { kind: 'pullRebase' }
  | { kind: 'stash'; message: string | null }
  | { kind: 'stashPop'; index: number }
  | { kind: 'stashDrop'; index: number }
  | { kind: 'reset'; mode: GitResetMode; target: string }
  | { kind: 'revert'; hash: string }
  | { kind: 'tag'; name: string; hash: string | null }
  | { kind: 'deleteTag'; name: string }
  | { kind: 'abortMerge' }
  | { kind: 'addRemote'; url: string }
  | { kind: 'commitPaths'; message: string; paths: string[] };

export interface GitApi {
  status(path: string): Promise<GitStatus>;
  branches(path: string): Promise<GitBranches>;
  diff(path: string, file: string, mode: GitDiffMode): Promise<string>;
  show(path: string, hash: string): Promise<string>;
  run(path: string, action: GitAction): Promise<GitResult>;
  extras(path: string): Promise<GitExtras>;
}

export interface GhApi {
  check(path: string): Promise<GhCheck>;
  repoCreate(path: string, name: string, isPrivate: boolean): Promise<GitResult>;
}

export interface DocsApi {
  list(path: string): Promise<DocEntry[]>;
  read(path: string, rel: string): Promise<string>;
  write(path: string, rel: string, content: string): Promise<void>;
}

export interface PmApi {
  getConfig(): Promise<AppConfig>;
  setRoot(root: string): Promise<AppConfig>;
  /** 只改設定欄位；root 走 setRoot */
  updateConfig(patch: ConfigPatch): Promise<AppConfig>;
  /** 系統資料夾選擇器；取消回 null，不改設定 */
  pickFolder(): Promise<string | null>;
  checkClaude(): Promise<ClaudeCheck>;
  listProjects(): Promise<ProjectInfo[]>;
  createProject(name: string): Promise<ProjectInfo>;
  initProject(path: string): Promise<ProjectInfo>;
  openProject(path: string): Promise<ProjectInfo>;
  rebuildState(path: string): Promise<ProjectInfo>;
  getGitLog(path: string, n?: number): Promise<GitCommit[]>;
  openPath(path: string): Promise<string>;
  git: GitApi;
  gh: GhApi;
  docs: DocsApi;
  /** 只開 http(s) / mailto；其他一律拒絕 */
  openExternal(url: string): Promise<void>;
  /** docs/**\/*.md 有新增、刪除或修改（每 2 秒比對一次） */
  onDocsChanged(cb: () => void): () => void;
  pty: {
    start(path: string, opts: PtyStartOptions): Promise<void>;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(): Promise<void>;
    onData(cb: (data: string) => void): () => void;
    onExit(cb: (code: number) => void): () => void;
    /** true = Claude Code 停在提示符等輸入（3 秒無輸出）；false = 忙碌或無 session */
    onIdle(cb: (idle: boolean) => void): () => void;
  };
  onStateChanged(cb: (p: ProjectInfo) => void): () => void;
  onGitChanged(cb: (commits: GitCommit[]) => void): () => void;
}

declare global {
  interface Window { pm: PmApi }
}
