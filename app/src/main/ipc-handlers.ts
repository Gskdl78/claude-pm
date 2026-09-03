import { existsSync } from 'node:fs';
import type { AppConfig, ClaudeCheck, ConfigPatch, GitCommit, InsightsReport, PinnedNote, ProjectInfo, PtyStartOptions, SessionInfo } from '../shared/types';
import { validatePatch } from '../shared/config-schema';
import { loadConfig, saveConfig, rememberProject, pinnedNotesPath } from './config';
import { assertNote, collectInsights, pinNote, readPinned, unpinNote, writePinned } from './insights';
import { assertInsideRoot } from './paths';
import { listProjects, readProjectInfo, createProject, cloneProject, assertCloneSource, initExisting, rebuildState } from './projects';
import { getLog } from './git';
import { createGitHandlers, type GitHandlers } from './git-handlers';
import { createDocsHandlers, type DocsHandlers } from './docs-handlers';
import { SessionManager, buildClaudeArgs, findClaude } from './pty';
import { ProjectWatcher } from './watcher';
import { BLOCKED_OPEN_EXT_RE, isExternalUrl } from './url-policy';

export interface HandlerDeps {
  pluginDir: string;
  configFile?: string;
  pty: SessionManager;
  send: (channel: string, ...args: unknown[]) => void;
  openPath?: (p: string) => Promise<string>;
  /** 只接 http(s) / mailto 的外部連結，交給系統瀏覽器開啟 */
  openExternal?: (url: string) => Promise<void>;
  checkClaude?: () => Promise<ClaudeCheck>;
  /** pty 成功啟動後呼叫，帶專案目錄（已通過 root 守衛） */
  onSessionStart?: (dir: string) => void;
  /** pty 被主動終止後呼叫；kill() 不會觸發 exit 事件，需由此清掉等待輸入狀態 */
  onSessionEnd?: (dir: string) => void;
  /** renderer 目前看的專案；用來決定背景 watcher 與通知規則 */
  onFocusChanged?: (path: string | null) => void;
  /** 使用者對某個 session 送出輸入（鍵盤 / 貼上 / 階段按鈕）；用來重置「已通知」狀態 */
  onUserInput?: (dir: string) => void;
  /** 背景 state watcher 週期（測試用） */
  watchIntervalMs?: number;
  /** 系統資料夾選擇器；沒注入（測試）時 dialog:pickFolder 回 null */
  pickFolder?: (defaultPath: string) => Promise<string | null>;
  /** 每次設定持久化後呼叫，讓 ipc.ts 更新通知開關等快取 */
  onConfigChanged?: (cfg: AppConfig) => void;
  /** 釘選注意事項檔；預設 ~/.claude-pm/pinned-notes.md，測試注入暫存路徑 */
  pinnedFile?: string;
}

export interface Handlers extends GitHandlers, DocsHandlers {
  'config:get': () => Promise<AppConfig>;
  'config:setRoot': (root: string) => Promise<AppConfig>;
  'config:update': (patch: ConfigPatch) => Promise<AppConfig>;
  'dialog:pickFolder': () => Promise<string | null>;
  'claude:check': () => Promise<ClaudeCheck>;
  'projects:list': () => Promise<ProjectInfo[]>;
  'projects:create': (name: string) => Promise<ProjectInfo>;
  'projects:clone': (source: string, name: string) => Promise<ProjectInfo>;
  'projects:init': (path: string) => Promise<ProjectInfo>;
  'projects:open': (path: string) => Promise<ProjectInfo>;
  'projects:rebuild': (path: string) => Promise<ProjectInfo>;
  'git:log': (path: string, n?: number) => Promise<GitCommit[]>;
  'shell:openPath': (path: string) => Promise<string>;
  'shell:openExternal': (url: string) => Promise<void>;
  'pty:start': (path: string, opts: PtyStartOptions) => Promise<void>;
  'pty:write': (path: string, data: string) => void;
  'pty:resize': (path: string, cols: number, rows: number) => void;
  'pty:kill': (path: string) => Promise<void>;
  'pty:list': () => Promise<SessionInfo[]>;
  'pty:focus': (path: string | null) => void;
  'insights:collect': () => Promise<InsightsReport>;
  'insights:pinned': () => Promise<PinnedNote[]>;
  'insights:pin': (note: PinnedNote) => Promise<PinnedNote[]>;
  'insights:unpin': (cause: string) => Promise<PinnedNote[]>;
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

  // 先寫檔再換快取：寫檔失敗時記憶體裡的設定要維持和磁碟一致。
  const persist = (next: AppConfig) => { saveConfig(next, deps.configFile); cfg = next; deps.onConfigChanged?.(cfg); };
  const guard = (p: string) => assertInsideRoot(cfg.root, p);
  const pinnedFile = deps.pinnedFile ?? pinnedNotesPath();
  const modelVars = () => ({
    implModel: cfg.implModel, reviewModel: cfg.reviewModel, maxRetries: cfg.maxRetries,
    ...(existsSync(pinnedFile) ? { pinnedFile } : {}),
  });

  let focusPath: string | null = null;
  const bgWatchers = new Map<string, ProjectWatcher>();
  const bgWatch = (dir: string) => {
    if (bgWatchers.has(dir)) return;
    const w = new ProjectWatcher(dir, deps.watchIntervalMs ?? 500, { stateOnly: true });
    w.on('state', () => deps.send('project:state', readProjectInfo(dir)));
    w.start();
    bgWatchers.set(dir, w);
  };
  const bgUnwatch = (dir: string) => { bgWatchers.get(dir)?.stop(); bgWatchers.delete(dir); };
  /** 非目前專案且有 live session 的目錄才需要背景 watcher */
  const syncBgWatchers = () => {
    const live = new Set(deps.pty.list().map((s) => s.path));
    for (const dir of [...bgWatchers.keys()]) if (!live.has(dir) || dir === focusPath) bgUnwatch(dir);
    for (const dir of live) if (dir !== focusPath) bgWatch(dir);
  };
  // pty 自己結束（不是被 kill）時清掉它的背景 watcher，避免留下沒有 session 的輪詢。
  const onPtyExit = () => { syncBgWatchers(); };
  deps.pty.on('exit', onPtyExit);
  /** 射後不理的頻道：路徑不合法就靜默忽略，不丟例外回 renderer */
  const softGuard = (p: unknown): string | null => { try { return typeof p === 'string' ? guard(p) : null; } catch { return null; } };

  const watch = (dir: string) => {
    watcher?.stop();
    watcher = new ProjectWatcher(dir);
    watcher.on('state', () => deps.send('project:state', readProjectInfo(dir)));
    watcher.on('git', () => { void getLog(dir).then((log) => deps.send('project:git', log)); });
    watcher.on('docs', () => deps.send('project:docs'));
    watcher.start();
  };

  return {
    'config:get': async () => cfg,

    'config:setRoot': async (root) => {
      if (!existsSync(root)) throw new Error(`root not found: ${root}`);
      watcher?.stop(); watcher = null;
      // 換了根目錄之後舊路徑會被 assertInsideRoot 擋下，renderer 再也殺不掉這些 session，
      // 所以必須在 persist 之前就地收乾淨，否則它們會變成沒人管的孤兒行程。
      const prev = deps.pty.list();
      deps.pty.killAll();
      for (const s of prev) deps.onSessionEnd?.(s.path);
      focusPath = null;
      deps.onFocusChanged?.(null);
      syncBgWatchers();
      persist({ ...cfg, root, lastProject: null });
      return cfg;
    },

    'config:update': async (patch) => { persist({ ...cfg, ...validatePatch(patch) }); return cfg; },

    'dialog:pickFolder': async () => (deps.pickFolder ? deps.pickFolder(cfg.root) : null),

    'claude:check': () => (deps.checkClaude ?? findClaude)(),

    'projects:list': async () => {
      if (cfg.lastProject && !existsSync(cfg.lastProject)) persist({ ...cfg, lastProject: null });
      return listProjects(cfg.root);
    },

    'projects:create': (name) => createProject(cfg.root, name, deps.pluginDir, modelVars()),

    'projects:clone': async (source, name) => cloneProject(cfg.root, assertCloneSource(source), name),

    'projects:init': async (path) => initExisting(guard(path), deps.pluginDir, modelVars()),

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

    ...createDocsHandlers(guard),

    'shell:openPath': async (path) => {
      const p = guard(path);
      // 文件裡的連結最後會走到這裡，不能讓它啟動 .bat/.exe 之類的可執行檔。
      if (BLOCKED_OPEN_EXT_RE.test(p)) throw new Error('refusing to open executable file');
      return deps.openPath ? deps.openPath(p) : '';
    },

    'shell:openExternal': async (url) => {
      if (!isExternalUrl(url)) throw new Error('invalid url');
      await deps.openExternal?.(url);
    },

    'pty:start': async (path, opts) => {
      const dir = guard(path);
      const initialPrompt = checkInitialPrompt(opts.initialPrompt);
      try {
        deps.pty.start(dir, {
          command: 'claude',
          args: buildClaudeArgs({ continue: opts.continue, initialPrompt }),
          cols: clampSize(opts.cols, 80),
          rows: clampSize(opts.rows, 24),
        });
      } catch (e) {
        // 失敗時也要收掉這個 session，否則舊的閒置計時器會送出幽靈通知。
        deps.onSessionEnd?.(dir);
        throw e;
      }
      deps.onSessionStart?.(dir);
      syncBgWatchers();
    },

    'pty:write': (path, data) => {
      const dir = softGuard(path);
      if (!dir || typeof data !== 'string') return;
      deps.pty.write(dir, data);
      deps.onUserInput?.(dir);
    },
    'pty:resize': (path, cols, rows) => {
      const dir = softGuard(path);
      if (!dir) return;
      if (typeof cols !== 'number' || !Number.isFinite(cols)) return;
      if (typeof rows !== 'number' || !Number.isFinite(rows)) return;
      deps.pty.resize(dir, cols, rows);
    },
    'pty:kill': async (path) => { const dir = guard(path); deps.pty.kill(dir); deps.onSessionEnd?.(dir); syncBgWatchers(); },
    'pty:list': async () => deps.pty.list(),
    'pty:focus': (path) => { focusPath = path === null ? null : softGuard(path); deps.onFocusChanged?.(focusPath); syncBgWatchers(); },

    'insights:collect': async () => collectInsights(cfg.root),
    'insights:pinned': async () => readPinned(pinnedFile),
    'insights:pin': async (note) => {
      const next = pinNote(readPinned(pinnedFile), assertNote(note));
      writePinned(pinnedFile, next);
      return next;
    },
    'insights:unpin': async (cause) => {
      if (typeof cause !== 'string' || cause.trim().length === 0) throw new Error('invalid cause');
      const next = unpinNote(readPinned(pinnedFile), cause);
      writePinned(pinnedFile, next);
      return next;
    },

    dispose: () => {
      deps.pty.off('exit', onPtyExit);
      watcher?.stop(); watcher = null;
      for (const dir of [...bgWatchers.keys()]) bgUnwatch(dir);
    },
  };
}
