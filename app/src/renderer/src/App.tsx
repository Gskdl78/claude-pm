import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppConfig, GitCommit, Notice, ProjectInfo, StageName } from '../../shared/types';
import { STAGE_LABELS } from '../../shared/types';
import { pm } from './api';
import { ProjectList } from './components/ProjectList';
import { NewProjectDialog } from './components/NewProjectDialog';
import { StagePanel } from './components/StagePanel';
import { GitPanel } from './components/git/GitPanel';
import { ConfirmDialog } from './components/git/ConfirmDialog';
import { CenterPane, type CenterTab } from './components/CenterPane';
import type { SessionState } from './components/Terminal';
import { SessionLimitDialog } from './components/SessionLimitDialog';
import { isDocRelPath } from '../../shared/docs-path';
import { errorMessage } from './errors';
import { explainGitError } from '../../shared/git-errors';
import { ClaudeMissing } from './components/ClaudeMissing';
import { SettingsDialog, type SettingsSubmit } from './components/SettingsDialog';

type Screen = 'loading' | 'claude-missing' | 'main';
type PtyStatus = 'idle' | 'running' | 'exited';

// 指令與 Enter 分成兩次寫入的間隔：一次送出「文字 + 換行」會被 Claude Code
// 當成貼上而不送出，只會把 /stage-xxx 留在輸入框裡。
export const ENTER_DELAY_MS = 50;
// GitPanel 只需要 id 遞增，不需要完整歷史，所以提示只保留最近幾筆。
const MAX_NOTICES = 50;

// renderer 沒有 node 的 path 模組，專案名一律從路徑尾端取。
function basename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [current, setCurrent] = useState<ProjectInfo | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [gitRevision, setGitRevision] = useState(0);
  // 每個專案一個 session；切換專案只是換顯示，不再殺掉前一個。
  const [sessions, setSessions] = useState<Record<string, SessionState>>({});
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [flashSeq, setFlashSeq] = useState(0);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [centerTab, setCenterTab] = useState<CenterTab>('terminal');
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [docsRevision, setDocsRevision] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  // 超過 session 上限而還沒開成的專案，連同主行程當下回報的 live session 清單；有值時顯示上限對話框
  const [limitPending, setLimitPending] = useState<{ project: ProjectInfo; live: Array<{ path: string; name: string }> } | null>(null);
  const [limitBusy, setLimitBusy] = useState(false);
  // 等待使用者確認關閉 session 的專案
  const [closeReq, setCloseReq] = useState<ProjectInfo | null>(null);
  // 設定對話框關閉（儲存或取消）時遞增，讓終端機把焦點要回來
  const [focusSeq, setFocusSeq] = useState(0);
  // 任一專案的 state 有變動時 +1，讓洞察分頁下次顯示時重讀
  const [insightsRevision, setInsightsRevision] = useState(0);
  // 洞察頁要求 git 面板開啟的 commit；seq 讓同一個 hash 也能重複觸發
  const [revealCommit, setRevealCommit] = useState<{ hash: string; seq: number } | null>(null);

  const currentRef = useRef<ProjectInfo | null>(null);
  // pty 事件是非同步進來的，回呼裡不能靠 render 時的 state 判斷。
  const sessionsRef = useRef<Record<string, SessionState>>({});
  sessionsRef.current = sessions;
  const projectsRef = useRef<ProjectInfo[]>([]);
  projectsRef.current = projects;
  const noticeId = useRef(0);
  const revealSeq = useRef(0);
  // 上一次看到的 (專案路徑, stage)；只在同一專案內比較，切專案就重設
  const lastStageRef = useRef<{ path: string; stage: StageName | 'done' } | null>(null);

  // currentRef must move in the same tick as the state, otherwise events that
  // arrive while openProject is awaiting are matched against a stale path.
  const setCurrentProject = useCallback((p: ProjectInfo | null) => {
    currentRef.current = p;
    setCurrent(p);
    if (!p) { lastStageRef.current = null; return; }
    // 每次都以最新資料為基準；onStateChanged 路徑會先呼叫 noteStageChange，
    // 寫入的值相同，因此不會漏掉或重複提示。
    lastStageRef.current = p.state ? { path: p.path, stage: p.state.stage } : null;
  }, []);

  // sessionsRef 必須跟著 state 一起換，否則同一輪連續進來的事件會看到舊的 map。
  const updateSession = useCallback((path: string, next: SessionState | null | ((prev: SessionState | undefined) => SessionState | null)) => {
    setSessions((prev) => {
      const value = typeof next === 'function' ? next(prev[path]) : next;
      // 刪除一個本來就不存在的 session：維持原物件，避免多一次無意義的 render。
      if (value === null && !(path in prev)) return prev;
      const copy = { ...prev };
      if (value === null) delete copy[path];
      else copy[path] = value;
      sessionsRef.current = copy;
      return copy;
    });
  }, []);

  // 階段提示與文件分頁共用同一個佇列；只保留最近 MAX_NOTICES 筆。
  const pushNotice = useCallback((text: string, kind: 'hint' | 'error' = 'hint') => {
    noticeId.current += 1;
    setNotices((prev) => [...prev, { id: noticeId.current, text, kind }].slice(-MAX_NOTICES));
  }, []);

  // watcher 送來新 state 時比對階段：同一專案、階段真的往前走才記一筆提示並閃爍。
  const noteStageChange = useCallback((p: ProjectInfo) => {
    if (!p.state) return;
    const last = lastStageRef.current;
    if (!last || last.path !== p.path) return;
    const next = p.state.stage;
    if (last.stage === next || last.stage === 'done') { lastStageRef.current = { path: p.path, stage: next }; return; }
    lastStageRef.current = { path: p.path, stage: next };
    const from = STAGE_LABELS[last.stage];
    const to = next === 'done' ? '全部完成' : STAGE_LABELS[next];
    pushNotice(`階段 ${from} 完成 → ${to}`);
    setFlashSeq((n) => n + 1);
  }, [pushNotice]);

  // 專案被刪掉（或換了根目錄）之後清單就看不到它了，留著的 session 一併收掉。
  const refreshProjects = useCallback(async () => {
    const list = await pm.listProjects();
    setProjects(list);
    const known = new Set(list.map((p) => p.path));
    for (const path of Object.keys(sessionsRef.current)) {
      if (known.has(path)) continue;
      void pm.pty.kill(path);
      updateSession(path, null);
    }
    return list;
  }, [updateSession]);

  const launch = useCallback(async (p: ProjectInfo, allowContinue: boolean) => {
    const envPending = !p.state || p.state.stages.env.status === 'pending';
    const usedContinue = allowContinue && !envPending;
    try {
      await pm.pty.start(p.path, {
        continue: usedContinue,
        initialPrompt: !usedContinue && envPending && p.initialized ? '/stage-env' : undefined,
        cols: 120,
        rows: 30,
      });
    } catch (e) {
      const msg = errorMessage(e);
      // 上限不是錯誤：請使用者挑一個 session 關掉再繼續。
      if (/too many sessions/.test(msg)) {
        // 名稱直接用主行程的 label（路徑尾端），確保清單就是真正還活著的 session。
        const live = await pm.pty.list();
        setLimitPending({ project: p, live: live.map((s) => ({ path: s.path, name: s.label })) });
        return;
      }
      updateSession(p.path, (prev) => ({ status: 'exited', idle: false, launchSeq: prev?.launchSeq ?? 0, usedContinue }));
      setError(msg);
      return;
    }
    // 新 session 一定從忙碌開始；主行程也會再送一次 idle=false。
    // Every launch gets a new pty at the fixed 120x30 above; bumping the seq
    // makes the terminal re-fit and clear the previous conversation.
    updateSession(p.path, (prev) => ({ status: 'running', idle: false, launchSeq: (prev?.launchSeq ?? 0) + 1, usedContinue }));
  }, [updateSession]);

  const openProject = useCallback(async (p: ProjectInfo) => {
    setError(null);
    setCenterTab('terminal');
    setSelectedDoc(null);
    const prev = currentRef.current;
    setCurrentProject(p);
    // 主行程要知道使用者在看哪個專案，才能分辨背景 session 的等待通知。
    pm.pty.focus(p.path);
    try {
      const info = await pm.openProject(p.path);
      // A newer open won while we were awaiting — drop this one entirely.
      if (currentRef.current?.path !== p.path) return;
      // Keep whatever a state-changed event delivered while we were opening.
      if (currentRef.current === p) setCurrentProject(info);
      const log = await pm.getGitLog(p.path, 30);
      // The git log is another await, and another chance to be superseded.
      if (currentRef.current?.path !== p.path) return;
      setCommits(log);
      // 已經有活著的 session：只是切回去看，不重開。
      if (sessionsRef.current[p.path]?.status === 'running') return;
      await launch(info, true);
    } catch (e) {
      // A superseded open must not clobber the winner's project or banner.
      if (currentRef.current?.path !== p.path) return;
      setCurrentProject(prev);
      pm.pty.focus(prev?.path ?? null);
      setError(errorMessage(e));
    }
  }, [launch, setCurrentProject]);

  // 關閉一個 session；目前專案留著 exited 狀態（覆蓋層可重新啟動），其他直接移除。
  const closeSession = useCallback(async (path: string, silent = false) => {
    try {
      await pm.pty.kill(path);
      if (currentRef.current?.path === path) {
        updateSession(path, (prev) => ({ status: 'exited', idle: false, launchSeq: prev?.launchSeq ?? 0, usedContinue: prev?.usedContinue ?? false }));
      } else {
        updateSession(path, null);
      }
      if (!silent) pushNotice(`已關閉 ${basename(path)} 的 session`);
    } catch (e) {
      pushNotice(errorMessage(e), 'error');
    }
  }, [updateSession, pushNotice]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const check = await pm.checkClaude();
      if (cancelled) return;
      if (!check.ok) { setScreen('claude-missing'); return; }
      const cfg = await pm.getConfig();
      const list = await refreshProjects();
      if (cancelled) return;
      // renderer 重載後主行程的 session 還活著：先接回來，切過去時才不會又開一份。
      // launchSeq 從 1 起算只是顯示用，與主行程實際啟動過幾次無關。
      const live = await pm.pty.list();
      if (cancelled) return;
      const seeded: Record<string, SessionState> = Object.fromEntries(
        live.map((s) => [s.path, { status: 'running' as const, idle: s.idle, launchSeq: 1, usedContinue: false }]),
      );
      sessionsRef.current = seeded;
      setSessions(seeded);
      setConfig(cfg);
      setScreen('main');
      if (cfg.lastProject) {
        const last = list.find((x) => x.path === cfg.lastProject);
        if (last) await openProject(last);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshProjects, openProject]);

  useEffect(() => {
    const offState = pm.onStateChanged((p) => {
      setProjects((prev) => prev.map((x) => (x.path === p.path ? p : x)));
      setInsightsRevision((n) => n + 1);
      if (currentRef.current?.path === p.path) { noteStageChange(p); setCurrentProject(p); }
    });
    const offGit = pm.onGitChanged((c) => { setCommits(c); setGitRevision((n) => n + 1); });
    const offDocs = pm.onDocsChanged(() => setDocsRevision((n) => n + 1));
    // idle 是狀態不是邊緣事件：同一個值可能連送兩次，直接覆寫即可。
    // 沒有 session 的路徑（已關閉）忽略。
    const offIdle = pm.pty.onIdle((path, idle) => {
      updateSession(path, (prev) => (prev ? { ...prev, idle } : null));
    });
    const offExit = pm.pty.onExit((path, code) => {
      const s = sessionsRef.current[path];
      if (!s) return;
      // A --continue launch that fails always gets exactly one retry without
      // it: the retry has usedContinue=false, so this cannot loop. 重試是
      // 逐 session 的，背景專案掛掉不會影響目前這個。
      if (s.usedContinue && code !== 0) {
        const info = currentRef.current?.path === path ? currentRef.current : projectsRef.current.find((x) => x.path === path);
        if (info) { void launch(info, false); return; }
      }
      // 背景 session 沒有覆蓋層可以按重新啟動，留著只是多一個沒用的 xterm 實例。
      if (currentRef.current?.path !== path) { updateSession(path, null); return; }
      updateSession(path, { ...s, status: 'exited', idle: false });
    });
    return () => { offState(); offGit(); offDocs(); offIdle(); offExit(); };
  }, [launch, setCurrentProject, noteStageChange, updateSession]);

  const handleNew = async (name: string) => {
    setDialogBusy(true); setDialogError(null);
    try {
      const created = await pm.createProject(name);
      await refreshProjects();
      setDialogOpen(false);
      await openProject(created);
    } catch (e) {
      setDialogError(errorMessage(e));
    } finally {
      setDialogBusy(false);
    }
  };

  // 從網址或本機路徑複製：主程序只做 git clone，不初始化 pm；開啟後側欄仍可按「初始化」。
  const handleClone = async (source: string, name: string) => {
    setDialogBusy(true); setDialogError(null);
    try {
      const info = await pm.cloneProject(source, name);
      await refreshProjects();
      setDialogOpen(false);
      await openProject(info);
    } catch (e) {
      // git clone 與來源驗證的錯誤都是英文（invalid clone source…），先過錯誤對映表
      const text = errorMessage(e);
      setDialogError(explainGitError(text) ?? text);
    } finally {
      setDialogBusy(false);
    }
  };

  const handleInit = async (p: ProjectInfo) => {
    setError(null);
    try {
      const info = await pm.initProject(p.path);
      await refreshProjects();
      await openProject(info);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  // 洞察頁「查看 commit」：必要時先切到該專案，再請 git 面板開啟 commit。
  const handleRevealCommit = async (path: string, hash: string) => {
    if (currentRef.current?.path !== path) {
      const target = projects.find((p) => p.path === path);
      if (!target) { setError(`找不到專案：${path}`); return; }
      await openProject(target);
      if (currentRef.current?.path !== path) return;   // 開啟失敗或被搶先
    }
    revealSeq.current += 1;
    setRevealCommit({ hash, seq: revealSeq.current });
  };

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setFocusSeq((n) => n + 1);
  }, []);

  // 改根目錄要先關掉所有 session 並重讀清單，才寫其他設定：
  // 換根目錄已經生效，之後的 updateConfig 失敗時畫面仍要跟主行程一致。
  const saveSettings = async ({ root, patch }: SettingsSubmit) => {
    if (!config) return;
    setSettingsBusy(true); setSettingsError(null);
    try {
      if (root !== config.root) {
        // 主行程在 config:setRoot 裡就把所有 session 收掉了：舊路徑已在新 root 之外，
        // renderer 這裡再呼叫 pty:kill 只會被守衛拒絕，所以只清畫面狀態。
        setConfig(await pm.setRoot(root));
        sessionsRef.current = {};
        setSessions({});
        pm.pty.focus(null);
        setCurrentProject(null); setCommits([]);
        setCenterTab('terminal'); setSelectedDoc(null);
        await refreshProjects();
      }
      const cfg = await pm.updateConfig(patch);
      setConfig(cfg);
      closeSettings();
    } catch (e) {
      setSettingsError(errorMessage(e));
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleRebuild = async () => {
    if (!current) return;
    try {
      const info = await pm.rebuildState(current.path);
      setCurrentProject(info);
      await refreshProjects();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  // .md 在 App 內預覽；其他（demo html 等）維持用外部程式開啟。
  const handleOpenDoc = (rel: string) => {
    if (!current) return;
    const norm = rel.replace(/\\/g, '/');
    if (isDocRelPath(norm)) { setSelectedDoc(norm); setCenterTab('docs'); return; }
    // shell.openPath 成功回空字串，失敗時把系統的錯誤訊息帶給使用者。
    void pm.openPath(`${current.path}\\${rel.replace(/\//g, '\\')}`).then((r) => {
      if (r) pushNotice(`無法開啟檔案：${r}`, 'error');
    });
  };

  const currentSession = current ? sessions[current.path] : undefined;
  const ptyStatus: PtyStatus = currentSession?.status ?? 'idle';
  const ptyIdle = currentSession?.idle ?? false;
  const livePaths = new Set(Object.entries(sessions).filter(([, s]) => s.status === 'running').map(([path]) => path));
  const waitingPaths = new Set(Object.entries(sessions).filter(([, s]) => s.status === 'running' && s.idle).map(([path]) => path));

  // 只在 Claude Code 停在提示符時送，避免打斷正在輸出的回應。
  // 指令與 Enter 分兩次寫入，否則整段會被當成貼上而不送出。
  const runStage = (stage: StageName) => {
    const path = current?.path;
    if (!path || ptyStatus !== 'running' || !ptyIdle) return;
    pm.pty.write(path, `/stage-${stage}`);
    window.setTimeout(() => { pm.pty.write(path, '\r'); }, ENTER_DELAY_MS);
  };

  // 上限對話框：關掉選中的 session（不另外提示），再把等著的專案開起來。
  const handleLimitClose = async (path: string) => {
    setLimitBusy(true);
    try {
      await closeSession(path, true);
      const pending = limitPending?.project;
      setLimitPending(null);
      if (pending) await launch(pending, true);
    } finally {
      setLimitBusy(false);
    }
  };

  if (screen === 'loading') return <div className="center muted">載入中…</div>;
  if (screen === 'claude-missing') return <ClaudeMissing />;

  return (
    <div className="app">
      <aside className="side">
        <div className="side-head">
          <div className="muted" title={config?.root}>{config?.root}</div>
          <button className="gear" aria-label="設定" title="設定" onClick={() => { setSettingsError(null); setSettingsOpen(true); }}>⚙</button>
        </div>
        <ProjectList projects={projects} currentPath={current?.path ?? null}
          livePaths={livePaths} waitingPaths={waitingPaths}
          onSelect={openProject} onInit={handleInit} onNew={() => { setDialogError(null); setDialogOpen(true); }}
          onInsights={() => setCenterTab('insights')} onCloseSession={setCloseReq} />
      </aside>
      <header className="stage">
        {error && <div className="error">{error}</div>}
        <StagePanel project={current} canRun={ptyStatus === 'running' && ptyIdle} flashSeq={flashSeq}
          onRebuild={handleRebuild} onOpenDoc={handleOpenDoc} onRunStage={runStage} />
      </header>
      <CenterPane tab={centerTab} onTab={setCenterTab}
        sessions={sessions} currentPath={current?.path ?? null}
        onRestart={(path) => { const info = projects.find((x) => x.path === path) ?? current; if (info) void launch(info, true); }}
        path={current?.path ?? null}
        stageDocs={current?.state && current.state.stage !== 'done' ? current.state.stages[current.state.stage].docs ?? [] : []}
        selectedDoc={selectedDoc} onSelectDoc={setSelectedDoc} docsRevision={docsRevision} onNotice={pushNotice}
        fontSize={config?.termFontSize ?? 14} focusSeq={focusSeq}
        insightsRevision={insightsRevision} onRevealCommit={(p, h) => { void handleRevealCommit(p, h); }} />
      <aside className="git">
        <GitPanel path={current?.path ?? null} commits={commits} revision={gitRevision} notices={notices} defaultLogHeight={config?.logHeight}
          revealCommit={revealCommit} stage={current?.state?.stage ?? null} />
      </aside>
      <NewProjectDialog open={dialogOpen} busy={dialogBusy} error={dialogError} onSubmit={handleNew} onClone={handleClone} onCancel={() => setDialogOpen(false)} />
      <ConfirmDialog
        request={closeReq ? {
          title: '關閉 session',
          description: `結束 ${closeReq.name} 的 Claude Code session？之後可用「重新啟動」以 --continue 接續。`,
          command: `pty:kill ${closeReq.name}`,
          danger: false,
        } : null}
        onConfirm={() => { const p = closeReq; setCloseReq(null); if (p) void closeSession(p.path); }}
        onCancel={() => setCloseReq(null)} />
      <SessionLimitDialog pending={limitPending?.project ?? null} live={limitPending?.live ?? []} busy={limitBusy}
        onClose={(path) => { void handleLimitClose(path); }} onCancel={() => setLimitPending(null)} />
      {config && (
        <SettingsDialog open={settingsOpen} config={config} busy={settingsBusy} error={settingsError}
          onPickFolder={() => pm.pickFolder()} onSave={(s) => { void saveSettings(s); }} onCancel={closeSettings} />
      )}
    </div>
  );
}
