import { existsSync } from 'node:fs';
import type { AppConfig, ClaudeCheck, GitCommit, ProjectInfo, PtyStartOptions } from '../shared/types';
import { loadConfig, saveConfig, rememberProject } from './config';
import { assertInsideRoot } from './paths';
import { listProjects, readProjectInfo, createProject, initExisting, rebuildState } from './projects';
import { getLog } from './git';
import { createGitHandlers, type GitHandlers } from './git-handlers';
import { PtyManager, buildClaudeArgs, findClaude } from './pty';
import { ProjectWatcher } from './watcher';

export interface HandlerDeps {
  pluginDir: string;
  configFile?: string;
  pty: PtyManager;
  send: (channel: string, ...args: unknown[]) => void;
  openPath?: (p: string) => Promise<string>;
  checkClaude?: () => Promise<ClaudeCheck>;
  /** pty 成功啟動後呼叫，帶專案目錄（已通過 root 守衛） */
  onSessionStart?: (dir: string) => void;
}

export interface Handlers extends GitHandlers {
  'config:get': () => Promise<AppConfig>;
  'config:setRoot': (root: string) => Promise<AppConfig>;
  'claude:check': () => Promise<ClaudeCheck>;
  'projects:list': () => Promise<ProjectInfo[]>;
  'projects:create': (name: string) => Promise<ProjectInfo>;
  'projects:init': (path: string) => Promise<ProjectInfo>;
  'projects:open': (path: string) => Promise<ProjectInfo>;
  'projects:rebuild': (path: string) => Promise<ProjectInfo>;
  'git:log': (path: string, n?: number) => Promise<GitCommit[]>;
  'shell:openPath': (path: string) => Promise<string>;
  'pty:start': (path: string, opts: PtyStartOptions) => Promise<void>;
  'pty:write': (data: string) => void;
  'pty:resize': (cols: number, rows: number) => void;
  'pty:kill': () => Promise<void>;
  dispose: () => void;
}

/** Only slash commands may be injected as the first prompt of a session. */
const SLASH_COMMAND_RE = /^\/[a-z][a-z0-9-]*$/;

function checkInitialPrompt(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !SLASH_COMMAND_RE.test(v)) throw new Error('invalid initialPrompt');
  return v;
}

/** The renderer is untrusted input: keep the pty geometry a sane integer. */
function clampSize(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(500, Math.max(1, Math.floor(v)));
}

export function createHandlers(deps: HandlerDeps): Handlers {
  let cfg = loadConfig(deps.configFile);
  let watcher: ProjectWatcher | null = null;

  const persist = (next: AppConfig) => { cfg = next; saveConfig(cfg, deps.configFile); };
  const guard = (p: string) => assertInsideRoot(cfg.root, p);

  const watch = (dir: string) => {
    watcher?.stop();
    watcher = new ProjectWatcher(dir);
    watcher.on('state', () => deps.send('project:state', readProjectInfo(dir)));
    watcher.on('git', () => { void getLog(dir).then((log) => deps.send('project:git', log)); });
    watcher.start();
  };

  return {
    'config:get': async () => cfg,

    'config:setRoot': async (root) => {
      if (!existsSync(root)) throw new Error(`root not found: ${root}`);
      watcher?.stop(); watcher = null;
      persist({ ...cfg, root, lastProject: null });
      return cfg;
    },

    'claude:check': () => (deps.checkClaude ?? findClaude)(),

    'projects:list': async () => {
      if (cfg.lastProject && !existsSync(cfg.lastProject)) persist({ ...cfg, lastProject: null });
      return listProjects(cfg.root);
    },

    'projects:create': (name) => createProject(cfg.root, name, deps.pluginDir),

    'projects:init': async (path) => initExisting(guard(path), deps.pluginDir),

    'projects:open': async (path) => {
      const dir = guard(path);
      if (!existsSync(dir)) throw new Error(`folder not found: ${dir}`);
      persist(rememberProject(cfg, dir));
      watch(dir);
      return readProjectInfo(dir);
    },

    'projects:rebuild': async (path) => rebuildState(guard(path), deps.pluginDir),

    'git:log': async (path, n) => getLog(guard(path), n),

    ...createGitHandlers(guard),

    'shell:openPath': async (path) => {
      const p = guard(path);
      return deps.openPath ? deps.openPath(p) : '';
    },

    'pty:start': async (path, opts) => {
      const dir = guard(path);
      const initialPrompt = checkInitialPrompt(opts.initialPrompt);
      deps.pty.start({
        cwd: dir,
        command: 'claude',
        args: buildClaudeArgs({ continue: opts.continue, initialPrompt }),
        cols: clampSize(opts.cols, 80),
        rows: clampSize(opts.rows, 24),
      });
      deps.onSessionStart?.(dir);
    },

    'pty:write': (data) => { if (typeof data === 'string') deps.pty.write(data); },
    'pty:resize': (cols, rows) => {
      if (typeof cols !== 'number' || !Number.isFinite(cols)) return;
      if (typeof rows !== 'number' || !Number.isFinite(rows)) return;
      deps.pty.resize(cols, rows);
    },
    'pty:kill': async () => deps.pty.kill(),

    dispose: () => { watcher?.stop(); watcher = null; },
  };
}
