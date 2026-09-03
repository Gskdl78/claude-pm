import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppConfig, GitCommit, Notice, ProjectInfo, StageName } from '../../shared/types';
import { STAGE_LABELS } from '../../shared/types';
import { pm } from './api';
import { ProjectList } from './components/ProjectList';
import { NewProjectDialog } from './components/NewProjectDialog';
import { StagePanel } from './components/StagePanel';
import { GitPanel } from './components/git/GitPanel';
import { CenterPane, type CenterTab } from './components/CenterPane';
import { isDocRelPath } from '../../shared/docs-path';
import { errorMessage } from './errors';
import { ClaudeMissing } from './components/ClaudeMissing';

type Screen = 'loading' | 'claude-missing' | 'main';
type PtyStatus = 'idle' | 'running' | 'exited';

// 指令與 Enter 分成兩次寫入的間隔：一次送出「文字 + 換行」會被 Claude Code
// 當成貼上而不送出，只會把 /stage-xxx 留在輸入框裡。
export const ENTER_DELAY_MS = 50;
// GitPanel 只需要 id 遞增，不需要完整歷史，所以提示只保留最近幾筆。
const MAX_NOTICES = 50;

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [current, setCurrent] = useState<ProjectInfo | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [gitRevision, setGitRevision] = useState(0);
  const [ptyStatus, setPtyStatus] = useState<PtyStatus>('idle');
  const [launchSeq, setLaunchSeq] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [ptyIdle, setPtyIdle] = useState(false);
  const [flashSeq, setFlashSeq] = useState(0);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [centerTab, setCenterTab] = useState<CenterTab>('terminal');
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [docsRevision, setDocsRevision] = useState(0);

  const currentRef = useRef<ProjectInfo | null>(null);
  const launchRef = useRef<{ usedContinue: boolean } | null>(null);
  const noticeId = useRef(0);
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

  const refreshProjects = useCallback(async () => {
    const list = await pm.listProjects();
    setProjects(list);
    return list;
  }, []);

  const launch = useCallback(async (p: ProjectInfo, allowContinue: boolean) => {
    const envPending = !p.state || p.state.stages.env.status === 'pending';
    const usedContinue = allowContinue && !envPending;
    launchRef.current = { usedContinue };
    try {
      await pm.pty.start(p.path, {
        continue: usedContinue,
        initialPrompt: !usedContinue && envPending && p.initialized ? '/stage-env' : undefined,
        cols: 120,
        rows: 30,
      });
    } catch (e) {
      setPtyIdle(false);
      setPtyStatus('exited');
      setError(errorMessage(e));
      return;
    }
    // 新 session 一定從忙碌開始；主行程也會再送一次 idle=false。
    setPtyIdle(false);
    setPtyStatus('running');
    // Every launch gets a new pty at the fixed 120x30 above; bumping the seq
    // makes Terminal re-fit and resize it to the real viewport each time.
    setLaunchSeq((n) => n + 1);
  }, []);

  const openProject = useCallback(async (p: ProjectInfo) => {
    setError(null);
    setPtyIdle(false);
    setCenterTab('terminal');
    setSelectedDoc(null);
    const prev = currentRef.current;
    setCurrentProject(p);
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
      await launch(info, true);
    } catch (e) {
      // A superseded open must not clobber the winner's project or banner.
      if (currentRef.current?.path !== p.path) return;
      setCurrentProject(prev);
      setError(errorMessage(e));
    }
  }, [launch, setCurrentProject]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const check = await pm.checkClaude();
      if (cancelled) return;
      if (!check.ok) { setScreen('claude-missing'); return; }
      const cfg = await pm.getConfig();
      const list = await refreshProjects();
      if (cancelled) return;
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
      if (currentRef.current?.path === p.path) { noteStageChange(p); setCurrentProject(p); }
    });
    const offGit = pm.onGitChanged((c) => { setCommits(c); setGitRevision((n) => n + 1); });
    const offDocs = pm.onDocsChanged(() => setDocsRevision((n) => n + 1));
    // idle 是狀態不是邊緣事件：同一個值可能連送兩次，直接覆寫即可。
    const offIdle = pm.pty.onIdle((idle) => setPtyIdle(idle));
    const offExit = pm.pty.onExit((code) => {
      setPtyIdle(false);
      const l = launchRef.current;
      const cur = currentRef.current;
      // A --continue launch that fails always gets exactly one retry without
      // it: the retry has usedContinue=false, so this cannot loop.
      if (l && cur && l.usedContinue && code !== 0) {
        void launch(cur, false);
        return;
      }
      setPtyStatus('exited');
    });
    return () => { offState(); offGit(); offDocs(); offIdle(); offExit(); };
  }, [launch, setCurrentProject, noteStageChange]);

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

  // 只在 Claude Code 停在提示符時送，避免打斷正在輸出的回應。
  // 指令與 Enter 分兩次寫入，否則整段會被當成貼上而不送出。
  const runStage = (stage: StageName) => {
    if (ptyStatus !== 'running' || !ptyIdle) return;
    pm.pty.write(`/stage-${stage}`);
    window.setTimeout(() => { pm.pty.write('\r'); }, ENTER_DELAY_MS);
  };

  if (screen === 'loading') return <div className="center muted">載入中…</div>;
  if (screen === 'claude-missing') return <ClaudeMissing />;

  return (
    <div className="app">
      <aside className="side">
        <div className="muted" title={config?.root}>{config?.root}</div>
        <ProjectList projects={projects} currentPath={current?.path ?? null}
          waitingPath={ptyIdle && ptyStatus === 'running' ? current?.path ?? null : null}
          onSelect={openProject} onInit={handleInit} onNew={() => { setDialogError(null); setDialogOpen(true); }} />
      </aside>
      <header className="stage">
        {error && <div className="error">{error}</div>}
        <StagePanel project={current} canRun={ptyStatus === 'running' && ptyIdle} flashSeq={flashSeq}
          onRebuild={handleRebuild} onOpenDoc={handleOpenDoc} onRunStage={runStage} />
      </header>
      <CenterPane tab={centerTab} onTab={setCenterTab}
        status={ptyStatus} launchSeq={launchSeq} onRestart={() => { if (current) void launch(current, true); }}
        path={current?.path ?? null}
        stageDocs={current?.state && current.state.stage !== 'done' ? current.state.stages[current.state.stage].docs ?? [] : []}
        selectedDoc={selectedDoc} onSelectDoc={setSelectedDoc} docsRevision={docsRevision} onNotice={pushNotice} />
      <aside className="git">
        <GitPanel path={current?.path ?? null} commits={commits} revision={gitRevision} notices={notices} />
      </aside>
      <NewProjectDialog open={dialogOpen} busy={dialogBusy} error={dialogError} onSubmit={handleNew} onCancel={() => setDialogOpen(false)} />
    </div>
  );
}
