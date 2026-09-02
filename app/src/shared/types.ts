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

export interface AppConfig {
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

export interface PmApi {
  getConfig(): Promise<AppConfig>;
  setRoot(root: string): Promise<AppConfig>;
  checkClaude(): Promise<ClaudeCheck>;
  listProjects(): Promise<ProjectInfo[]>;
  createProject(name: string): Promise<ProjectInfo>;
  initProject(path: string): Promise<ProjectInfo>;
  openProject(path: string): Promise<ProjectInfo>;
  rebuildState(path: string): Promise<ProjectInfo>;
  getGitLog(path: string, n?: number): Promise<GitCommit[]>;
  openPath(path: string): Promise<string>;
  pty: {
    start(path: string, opts: PtyStartOptions): Promise<void>;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(): Promise<void>;
    onData(cb: (data: string) => void): () => void;
    onExit(cb: (code: number) => void): () => void;
  };
  onStateChanged(cb: (p: ProjectInfo) => void): () => void;
  onGitChanged(cb: (commits: GitCommit[]) => void): () => void;
}

declare global {
  interface Window { pm: PmApi }
}
