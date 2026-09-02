import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppConfig, GitCommit, ProjectInfo } from '../../shared/types';
import { pm } from './api';
import { ProjectList } from './components/ProjectList';
import { NewProjectDialog } from './components/NewProjectDialog';
import { StagePanel } from './components/StagePanel';
import { Terminal } from './components/Terminal';
import { GitLog } from './components/GitLog';
import { ClaudeMissing } from './components/ClaudeMissing';

type Screen = 'loading' | 'claude-missing' | 'main';
type PtyStatus = 'idle' | 'running' | 'exited';
const CONTINUE_FALLBACK_MS = 5000;

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [current, setCurrent] = useState<ProjectInfo | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [ptyStatus, setPtyStatus] = useState<PtyStatus>('idle');
  const [launchSeq, setLaunchSeq] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const currentRef = useRef<ProjectInfo | null>(null);
  const launchRef = useRef<{ at: number; usedContinue: boolean } | null>(null);

  // currentRef must move in the same tick as the state, otherwise events that
  // arrive while openProject is awaiting are matched against a stale path.
  const setCurrentProject = useCallback((p: ProjectInfo | null) => {
    currentRef.current = p;
    setCurrent(p);
  }, []);

  const refreshProjects = useCallback(async () => {
    const list = await pm.listProjects();
    setProjects(list);
    return list;
  }, []);

  const launch = useCallback(async (p: ProjectInfo, allowContinue: boolean) => {
    const envPending = !p.state || p.state.stages.env.status === 'pending';
    const usedContinue = allowContinue && !envPending;
    launchRef.current = { at: Date.now(), usedContinue };
    try {
      await pm.pty.start(p.path, {
        continue: usedContinue,
        initialPrompt: !usedContinue && envPending && p.initialized ? '/stage-env' : undefined,
        cols: 120,
        rows: 30,
      });
    } catch (e) {
      setPtyStatus('exited');
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setPtyStatus('running');
    // Every launch gets a new pty at the fixed 120x30 above; bumping the seq
    // makes Terminal re-fit and resize it to the real viewport each time.
    setLaunchSeq((n) => n + 1);
  }, []);

  const openProject = useCallback(async (p: ProjectInfo) => {
    setError(null);
    setCurrentProject(p);
    try {
      const info = await pm.openProject(p.path);
      // A newer open won while we were awaiting — drop this one entirely.
      if (currentRef.current?.path !== p.path) return;
      // Keep whatever a state-changed event delivered while we were opening.
      if (currentRef.current === p) setCurrentProject(info);
      setCommits(await pm.getGitLog(p.path, 30));
      await launch(currentRef.current ?? info, true);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
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
      if (currentRef.current?.path === p.path) setCurrentProject(p);
    });
    const offGit = pm.onGitChanged((c) => setCommits(c));
    const offExit = pm.pty.onExit((code) => {
      const l = launchRef.current;
      const cur = currentRef.current;
      if (l && cur && l.usedContinue && code !== 0 && Date.now() - l.at < CONTINUE_FALLBACK_MS) {
        void launch(cur, false);
        return;
      }
      setPtyStatus('exited');
    });
    return () => { offState(); offGit(); offExit(); };
  }, [launch, setCurrentProject]);

  const handleNew = async (name: string) => {
    setDialogBusy(true); setDialogError(null);
    try {
      const created = await pm.createProject(name);
      await refreshProjects();
      setDialogOpen(false);
      await openProject(created);
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : String(e));
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
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRebuild = async () => {
    if (!current) return;
    try {
      const info = await pm.rebuildState(current.path);
      setCurrentProject(info);
      await refreshProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleOpenDoc = (rel: string) => {
    if (current) void pm.openPath(`${current.path}\\${rel}`);
  };

  if (screen === 'loading') return <div className="center muted">載入中…</div>;
  if (screen === 'claude-missing') return <ClaudeMissing />;

  return (
    <div className="app">
      <aside className="side">
        <div className="muted" title={config?.root}>{config?.root}</div>
        <ProjectList projects={projects} currentPath={current?.path ?? null} onSelect={openProject} onInit={handleInit} onNew={() => { setDialogError(null); setDialogOpen(true); }} />
      </aside>
      <header className="stage">
        {error && <div className="error">{error}</div>}
        <StagePanel project={current} onRebuild={handleRebuild} onOpenDoc={handleOpenDoc} />
      </header>
      <Terminal status={ptyStatus} launchSeq={launchSeq} onRestart={() => { if (current) void launch(current, true); }} />
      <aside className="git">
        <GitLog commits={commits} />
      </aside>
      <NewProjectDialog open={dialogOpen} busy={dialogBusy} error={dialogError} onSubmit={handleNew} onCancel={() => setDialogOpen(false)} />
    </div>
  );
}
