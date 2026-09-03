import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import type { GitCommit, PmApi, ProjectInfo, StageName } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/config-schema';

const CFG = { root: 'C:\\P', lastProject: null as string | null, recent: [] as string[], ...DEFAULT_SETTINGS };

type MockSession = { status: string; idle: boolean; launchSeq: number };

// TerminalHost 的替身：data-status / data-launch 反映目前專案的 session，
// 每個 session 另外渲染一個 data-session，讓測試看得到背景 session。
vi.mock('./components/Terminal', () => ({
  TerminalHost: ({ sessions, currentPath, onRestart, visible = true }: { sessions: Record<string, MockSession>; currentPath: string | null; onRestart: (path: string) => void; visible?: boolean }) => {
    const cur = currentPath ? sessions[currentPath] : undefined;
    return (
      <div data-testid="terminal" data-current={currentPath ?? ''} data-status={cur?.status ?? 'idle'} data-launch={cur?.launchSeq ?? 0} hidden={!visible}>
        {Object.entries(sessions).map(([p, s]) => <div key={p} data-testid="session" data-session={`${p}:${s.status}:${s.launchSeq}`} />)}
        <button onClick={() => { if (currentPath) onRestart(currentPath); }}>重新啟動</button>
      </div>
    );
  },
}));

vi.mock('./components/insights/InsightsView', () => ({
  InsightsView: ({ hidden, onRevealCommit }: { hidden: boolean; onRevealCommit: (p: string, h: string) => void }) => (
    <div data-testid="insights" hidden={hidden}><button onClick={() => onRevealCommit('C:\\P\\beta', 'abc1234')}>reveal</button></div>
  ),
}));

// 只有檢查 notices 的測試才替換 GitPanel：其餘測試（含既有的 git 面板測試）仍用真的元件。
// App 在每個測試才動態 import，所以 doMock 必須在 renderApp 之前呼叫。
function mockGitPanel() {
  vi.doMock('./components/git/GitPanel', () => ({
    GitPanel: ({ notices, revealCommit, stage }: { notices?: Array<{ id: number; text: string }>; revealCommit?: { hash: string; seq: number } | null; stage?: string | null }) => (
      <div data-testid="git-panel" data-stage={stage ?? ''}>
        {(notices ?? []).map((n) => <div key={n.id} className="notice">{n.text}</div>)}
        <div className="reveal">{revealCommit?.hash}</div>
      </div>
    ),
  }));
}

function project(name: string, envStatus: 'pending' | 'done' = 'pending'): ProjectInfo {
  return {
    name, path: `C:\\P\\${name}`, initialized: true,
    state: {
      version: 1, name, type: 'other', stage: 'env',
      stages: { env: { status: envStatus }, design: { status: 'pending' }, tech: { status: 'pending' }, build: { status: 'pending' }, verify: { status: 'pending' } },
      issues: [],
    },
  };
}

function projectAt(name: string, stage: StageName | 'done', status: 'pending' | 'in_progress' | 'blocked' = 'in_progress'): ProjectInfo {
  const p = project(name, 'done');
  const s = p.state!;
  if (stage !== 'done') s.stages[stage] = { status };
  s.stage = stage;
  return p;
}

type Listeners = { state: Array<(p: ProjectInfo) => void>; exit: Array<(path: string, c: number) => void>; idle: Array<(path: string, i: boolean) => void>; docs: Array<() => void> };

function mockApi(overrides: Partial<PmApi> = {}, listeners: Listeners = { state: [], exit: [], idle: [], docs: [] }): PmApi {
  const api: PmApi = {
    getConfig: vi.fn(async () => ({ ...CFG, lastProject: null })),
    setRoot: vi.fn(),
    updateConfig: vi.fn(async (patch) => ({ ...CFG, ...patch })),
    pickFolder: vi.fn(async () => null),
    checkClaude: vi.fn(async () => ({ ok: true, path: 'claude' })),
    listProjects: vi.fn(async () => [project('alpha')]),
    createProject: vi.fn(async (name: string) => project(name)),
    cloneProject: vi.fn(async (_source: string, name: string) => ({ ...project(name), initialized: false, state: null })),
    initProject: vi.fn(),
    openProject: vi.fn(async (path: string) => project(path.split('\\').pop()!)),
    rebuildState: vi.fn(),
    getGitLog: vi.fn(async () => []),
    openPath: vi.fn(async () => ''),
    git: {
      status: vi.fn(async () => ({
        isRepo: true, branch: 'main', detached: false, noCommits: false, upstream: null,
        ahead: 0, behind: 0, hasRemote: false, merging: false, files: [],
      })),
      branches: vi.fn(async () => ({ current: 'main', all: ['main'] })),
      diff: vi.fn(async () => ''),
      show: vi.fn(async () => ''),
      run: vi.fn(async () => ({ ok: true, code: 0, stdout: '', stderr: '', command: 'git' })),
      extras: vi.fn(async () => ({ stashes: [], tags: [] })),
    },
    gh: {
      check: vi.fn(async () => ({ installed: false, version: null, authed: false, detail: '' })),
      repoCreate: vi.fn(async () => ({ ok: false, code: 1, stdout: '', stderr: '', command: 'gh' })),
    },
    docs: {
      list: vi.fn(async () => []),
      read: vi.fn(async () => ''),
      write: vi.fn(async () => {}),
    },
    insights: {
      collect: vi.fn(async () => ({ items: [], projects: 0, skipped: [] })),
      pinned: vi.fn(async () => []),
      pin: vi.fn(async () => []),
      unpin: vi.fn(async () => []),
    },
    openExternal: vi.fn(async () => {}),
    onDocsChanged: vi.fn((cb) => { listeners.docs.push(cb); return () => {}; }),
    pty: {
      start: vi.fn(async () => {}),
      write: vi.fn(), resize: vi.fn(), kill: vi.fn(async () => {}),
      list: vi.fn(async () => []), focus: vi.fn(),
      onData: vi.fn(() => () => {}),
      onExit: vi.fn((cb) => { listeners.exit.push(cb); return () => {}; }),
      onIdle: vi.fn((cb) => { listeners.idle.push(cb); return () => {}; }),
    },
    onStateChanged: vi.fn((cb) => { listeners.state.push(cb); return () => {}; }),
    onGitChanged: vi.fn(() => () => {}),
    ...overrides,
  };
  return api;
}

async function renderApp(api: PmApi) {
  (window as unknown as { pm: PmApi }).pm = api;
  const { default: App } = await import('./App');
  return render(<App />);
}

beforeEach(() => { vi.resetModules(); vi.doUnmock('./components/git/GitPanel'); });

describe('App', () => {
  it('shows install screen when claude is missing', async () => {
    await renderApp(mockApi({ checkClaude: vi.fn(async () => ({ ok: false })) }));
    expect(await screen.findByText('找不到 Claude Code')).toBeInTheDocument();
  });

  it('lists projects and opens one with /stage-env when env is pending', async () => {
    const api = mockApi();
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await waitFor(() => expect(api.openProject).toHaveBeenCalledWith('C:\\P\\alpha'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\alpha', expect.objectContaining({ continue: false, initialPrompt: '/stage-env' })));
    expect(screen.getByTestId('terminal')).toHaveAttribute('data-status', 'running');
  });

  it('auto-opens lastProject with --continue and falls back when continue exits early', async () => {
    const listeners: Listeners = { state: [], exit: [], idle: [], docs: [] };
    const api = mockApi({
      getConfig: vi.fn(async () => ({ ...CFG, lastProject: 'C:\\P\\beta' })),
      listProjects: vi.fn(async () => [project('beta', 'done')]),
      openProject: vi.fn(async () => project('beta', 'done')),
    }, listeners);
    await renderApp(api);
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\beta', expect.objectContaining({ continue: true })));
    await act(async () => { listeners.exit.forEach((cb) => cb('C:\\P\\beta', 1)); });
    await waitFor(() => expect(api.pty.start).toHaveBeenLastCalledWith('C:\\P\\beta', expect.objectContaining({ continue: false })));
    await act(async () => { listeners.exit.forEach((cb) => cb('C:\\P\\beta', 0)); });
    expect(screen.getByTestId('terminal')).toHaveAttribute('data-status', 'exited');
  });

  it('creates a project from the dialog and opens it', async () => {
    const api = mockApi();
    await renderApp(api);
    fireEvent.click(await screen.findByRole('button', { name: '+ 新專案' }));
    fireEvent.change(screen.getByLabelText('專案名稱'), { target: { value: 'gamma' } });
    fireEvent.click(screen.getByRole('button', { name: '建立' }));
    await waitFor(() => expect(api.createProject).toHaveBeenCalledWith('gamma'));
    await waitFor(() => expect(api.openProject).toHaveBeenCalledWith('C:\\P\\gamma'));
  });

  it('ignores a superseded openProject when another project is opened first', async () => {
    let resolveAlpha!: (info: ProjectInfo) => void;
    const alphaPending = new Promise<ProjectInfo>((resolve) => { resolveAlpha = resolve; });
    const api = mockApi({
      listProjects: vi.fn(async () => [project('alpha'), project('beta', 'done')]),
      openProject: vi.fn((path: string) =>
        (path.endsWith('alpha') ? alphaPending : Promise.resolve(project('beta', 'done')))),
    });
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await waitFor(() => expect(api.openProject).toHaveBeenCalledWith('C:\\P\\alpha'));
    fireEvent.click(screen.getByText('beta'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\beta', expect.anything()));
    await act(async () => { resolveAlpha(project('alpha')); });
    expect(api.pty.start).toHaveBeenCalledTimes(1);
    expect(api.pty.start).not.toHaveBeenCalledWith('C:\\P\\alpha', expect.anything());
    expect(api.getGitLog).not.toHaveBeenCalledWith('C:\\P\\alpha', 30);
    expect(screen.getByText(/^beta ·/)).toBeInTheDocument();
  });

  it('falls back once without --continue when a continue launch fails late', async () => {
    const listeners: Listeners = { state: [], exit: [], idle: [], docs: [] };
    const api = mockApi({
      getConfig: vi.fn(async () => ({ ...CFG, lastProject: 'C:\\P\\beta' })),
      listProjects: vi.fn(async () => [project('beta', 'done')]),
      openProject: vi.fn(async () => project('beta', 'done')),
    }, listeners);
    await renderApp(api);
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\beta', expect.objectContaining({ continue: true })));

    // Well past the old 5s fallback window: the fallback must still happen.
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    await act(async () => { listeners.exit.forEach((cb) => cb('C:\\P\\beta', 1)); });
    now.mockRestore();
    await waitFor(() => expect(api.pty.start).toHaveBeenLastCalledWith('C:\\P\\beta', expect.objectContaining({ continue: false })));
    expect(api.pty.start).toHaveBeenCalledTimes(2);

    // The fallback launch failing must not start yet another --continue launch.
    await act(async () => { listeners.exit.forEach((cb) => cb('C:\\P\\beta', 1)); });
    expect(api.pty.start).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('terminal')).toHaveAttribute('data-status', 'exited');

    // A manual restart may use --continue again: a fresh session can now exist.
    fireEvent.click(screen.getByText('重新啟動'));
    await waitFor(() => expect(api.pty.start).toHaveBeenLastCalledWith('C:\\P\\beta', expect.objectContaining({ continue: true })));
  });

  it('drops a superseded open whose git log resolves last', async () => {
    let resolveLog!: (c: GitCommit[]) => void;
    const alphaLog = new Promise<GitCommit[]>((resolve) => { resolveLog = resolve; });
    const api = mockApi({
      listProjects: vi.fn(async () => [project('alpha'), project('beta', 'done')]),
      getGitLog: vi.fn((path: string) => (path.endsWith('alpha') ? alphaLog : Promise.resolve([]))),
    });
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await waitFor(() => expect(api.getGitLog).toHaveBeenCalledWith('C:\\P\\alpha', 30));
    fireEvent.click(screen.getByText('beta'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\beta', expect.anything()));
    await act(async () => { resolveLog([]); });
    expect(api.pty.start).toHaveBeenCalledTimes(1);
    expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\beta', expect.anything());
  });

  it('reverts to the previous project when an open fails', async () => {
    const api = mockApi({
      listProjects: vi.fn(async () => [project('alpha'), project('beta', 'done')]),
      openProject: vi.fn((path: string) =>
        (path.endsWith('beta') ? Promise.reject(new Error('boom')) : Promise.resolve(project('alpha')))),
    });
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\alpha', expect.anything()));
    fireEvent.click(screen.getByText('beta'));
    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(screen.getByText(/^alpha ·/)).toBeInTheDocument();
  });

  it('stays quiet when a superseded open rejects', async () => {
    let rejectAlpha!: (e: Error) => void;
    const alphaOpen = new Promise<ProjectInfo>((_, reject) => { rejectAlpha = reject; });
    const api = mockApi({
      listProjects: vi.fn(async () => [project('alpha'), project('beta', 'done')]),
      openProject: vi.fn((path: string) =>
        (path.endsWith('alpha') ? alphaOpen : Promise.resolve(project('beta', 'done')))),
    });
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await waitFor(() => expect(api.openProject).toHaveBeenCalledWith('C:\\P\\alpha'));
    fireEvent.click(screen.getByText('beta'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\beta', expect.anything()));
    await act(async () => { rejectAlpha(new Error('late alpha failure')); });
    expect(screen.queryByText('late alpha failure')).not.toBeInTheDocument();
    expect(screen.getByText(/^beta ·/)).toBeInTheDocument();
  });

  it('strips the electron remote-method prefix from error text', async () => {
    const api = mockApi({
      createProject: vi.fn(async () => {
        throw new Error("Error invoking remote method 'projects:create': Error: 名稱已存在");
      }),
    });
    await renderApp(api);
    fireEvent.click(await screen.findByRole('button', { name: '+ 新專案' }));
    fireEvent.change(screen.getByLabelText('專案名稱'), { target: { value: 'gamma' } });
    fireEvent.click(screen.getByRole('button', { name: '建立' }));
    expect(await screen.findByText('名稱已存在')).toBeInTheDocument();
  });

  it('surfaces a pty spawn failure', async () => {
    const api = mockApi();
    api.pty.start = vi.fn(async () => { throw new Error('spawn ENOENT'); });
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await waitFor(() => expect(screen.getByTestId('terminal')).toHaveAttribute('data-status', 'exited'));
    expect(screen.getByText('spawn ENOENT')).toBeInTheDocument();
  });

  it('updates the stage panel when state changes arrive', async () => {
    const listeners: Listeners = { state: [], exit: [], idle: [], docs: [] };
    const api = mockApi({}, listeners);
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await waitFor(() => expect(api.openProject).toHaveBeenCalled());
    const updated = project('alpha', 'done');
    updated.state!.stage = 'design';
    updated.state!.stages.design = { status: 'in_progress', docs: ['docs/product/demo/index.html'] };
    await act(async () => { listeners.state.forEach((cb) => cb(updated)); });
    expect(screen.getByText('產品設計')).toHaveClass('in_progress');
    fireEvent.click(screen.getByRole('button', { name: 'docs/product/demo/index.html' }));
    expect(api.openPath).toHaveBeenCalledWith('C:\\P\\alpha\\docs\\product\\demo\\index.html');
  });

  it('mounts the git panel for the open project and refreshes it on git events', async () => {
    const gitListeners: Array<(c: GitCommit[]) => void> = [];
    const api = mockApi({ onGitChanged: vi.fn((cb) => { gitListeners.push(cb); return () => {}; }) });
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await waitFor(() => expect(api.git.status).toHaveBeenCalledWith('C:\\P\\alpha'));
    expect(await screen.findByRole('tab', { name: '變更' })).toBeInTheDocument();
    const n = vi.mocked(api.git.status).mock.calls.length;
    await act(async () => { gitListeners.forEach((cb) => cb([{ hash: 'abc1234', date: '2026-09-02T10:00:00+08:00', message: 'chore: x' }])); });
    await waitFor(() => expect(vi.mocked(api.git.status).mock.calls.length).toBeGreaterThan(n));
    fireEvent.click(screen.getByRole('tab', { name: '歷史' }));
    expect(screen.getByText('chore: x')).toBeInTheDocument();
  });

  it('enables the stage button and shows the waiting pill only while the pty is idle', async () => {
    mockGitPanel();
    const listeners: Listeners = { state: [], exit: [], idle: [], docs: [] };
    const alpha = projectAt('alpha', 'design');
    const api = mockApi({
      listProjects: vi.fn(async () => [alpha]),
      openProject: vi.fn(async () => alpha),
    }, listeners);
    await renderApp(api);
    // renderApp 已經動態載入過 App，這裡拿到的是同一個模組實例。
    const { ENTER_DELAY_MS } = await import('./App');
    fireEvent.click(await screen.findByText('alpha'));
    const btn = await screen.findByRole('button', { name: /產品設計/ });
    expect(btn).toBeDisabled();
    expect(screen.queryByText('● 等待回覆')).toBeNull();

    act(() => { for (const cb of listeners.idle) cb('C:\\P\\alpha', true); });
    expect(btn).toBeEnabled();
    expect(screen.getByText('● 等待回覆')).toBeInTheDocument();

    // 指令與 Enter 必須分開寫入，合成一段會被 Claude Code 當成貼上而不送出；
    // 兩次都要帶目前專案的路徑。
    try {
      vi.useFakeTimers();
      fireEvent.click(btn);
      expect(api.pty.write).toHaveBeenNthCalledWith(1, 'C:\\P\\alpha', '/stage-design');
      expect(api.pty.write).toHaveBeenCalledTimes(1);
      act(() => { vi.advanceTimersByTime(ENTER_DELAY_MS); });
      expect(api.pty.write).toHaveBeenNthCalledWith(2, 'C:\\P\\alpha', '\r');
    } finally {
      vi.useRealTimers();
    }

    act(() => { for (const cb of listeners.idle) cb('C:\\P\\alpha', false); });
    expect(btn).toBeDisabled();
    expect(screen.queryByText('● 等待回覆')).toBeNull();
  });

  it('flashes the stage row and posts a notice when the stage advances', async () => {
    mockGitPanel();
    const listeners: Listeners = { state: [], exit: [], idle: [], docs: [] };
    const alpha = projectAt('alpha', 'design');
    const api = mockApi({
      listProjects: vi.fn(async () => [alpha]),
      openProject: vi.fn(async () => alpha),
    }, listeners);
    const { container } = await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await screen.findByRole('button', { name: /產品設計/ });

    const advanced = projectAt('alpha', 'tech', 'pending');
    advanced.state!.stages.design = { status: 'done', commit: 'abc1234' };
    act(() => { for (const cb of listeners.state) cb(advanced); });

    expect(container.querySelector('.stages')).toHaveClass('flash');
    expect(screen.getByText('階段 產品設計 完成 → 技術設計')).toHaveClass('notice');

    // 同一 stage 再送一次（例如 add-doc）不重複記錄
    act(() => { for (const cb of listeners.state) cb({ ...advanced }); });
    expect(screen.getAllByText(/^階段 /)).toHaveLength(1);
  });

  it('seeds the stage baseline from 重建 state so the next change is reported', async () => {
    mockGitPanel();
    const listeners: Listeners = { state: [], exit: [], idle: [], docs: [] };
    const alpha = projectAt('alpha', 'design');
    const api = mockApi({
      listProjects: vi.fn(async () => [alpha]),
      openProject: vi.fn(async () => ({ ...alpha, state: null })),
      rebuildState: vi.fn(async () => alpha),
    }, listeners);
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    fireEvent.click(await screen.findByRole('button', { name: '重建 state' }));
    await screen.findByRole('button', { name: /產品設計/ });

    const advanced = projectAt('alpha', 'tech', 'pending');
    advanced.state!.stages.design = { status: 'done', commit: 'abc1234' };
    act(() => { for (const cb of listeners.state) cb(advanced); });
    expect(screen.getByText('階段 產品設計 完成 → 技術設計')).toHaveClass('notice');
  });

  it('reports 全部完成 when the last stage finishes and does not compare across projects', async () => {
    mockGitPanel();
    const listeners: Listeners = { state: [], exit: [], idle: [], docs: [] };
    const alpha = projectAt('alpha', 'verify');
    const beta = projectAt('beta', 'env', 'pending');
    const api = mockApi({
      listProjects: vi.fn(async () => [alpha, beta]),
      openProject: vi.fn(async (path: string) => (path.endsWith('alpha') ? alpha : beta)),
    }, listeners);
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await screen.findByRole('button', { name: /人工驗證/ });

    // 另一個專案的 state 事件不觸發比較
    act(() => { for (const cb of listeners.state) cb(projectAt('beta', 'design')); });
    expect(screen.queryByText(/^階段 /)).toBeNull();

    const finished = projectAt('alpha', 'done');
    act(() => { for (const cb of listeners.state) cb(finished); });
    expect(screen.getByText('階段 人工驗證 完成 → 全部完成')).toBeInTheDocument();
  });

  it('clears idle when a new session starts', async () => {
    mockGitPanel();
    const listeners: Listeners = { state: [], exit: [], idle: [], docs: [] };
    const alpha = projectAt('alpha', 'design');
    const api = mockApi({ listProjects: vi.fn(async () => [alpha]), openProject: vi.fn(async () => alpha) }, listeners);
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await screen.findByRole('button', { name: /產品設計/ });
    act(() => { for (const cb of listeners.idle) cb('C:\\P\\alpha', true); });
    expect(screen.getByText('● 等待回覆')).toBeInTheDocument();

    act(() => { for (const cb of listeners.exit) cb('C:\\P\\alpha', 0); });
    expect(screen.queryByText('● 等待回覆')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重新啟動' }));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('● 等待回覆')).toBeNull();
  });
  it('opens a stage doc in the docs tab and re-lists on project:docs', async () => {
    const listeners: Listeners = { state: [], exit: [], idle: [], docs: [] };
    const alpha = projectAt('alpha', 'design');
    alpha.state!.stages.design.docs = ['docs/product/prd.md', 'docs/product/demo/index.html'];
    const api = mockApi({
      listProjects: vi.fn(async () => [alpha]),
      openProject: vi.fn(async () => alpha),
      docs: { list: vi.fn(async () => [{ rel: 'docs/product/prd.md', size: 1, mtimeMs: 1 }]), read: vi.fn(async () => '# PRD'), write: vi.fn(async () => {}) },
    }, listeners);
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await screen.findByRole('button', { name: /產品設計/ });
    expect(screen.getByRole('tab', { name: '終端機' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'docs/product/prd.md' }));
    expect(screen.getByRole('tab', { name: '文件' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('terminal')).toHaveAttribute('hidden');
    await waitFor(() => expect(api.docs.read).toHaveBeenCalledWith('C:\\P\\alpha', 'docs/product/prd.md'));
    expect(await screen.findByRole('heading', { level: 1, name: 'PRD' })).toBeInTheDocument();

    // 非 md 的文件按鈕仍用外部程式開啟
    fireEvent.click(screen.getByRole('button', { name: 'docs/product/demo/index.html' }));
    expect(api.openPath).toHaveBeenCalledWith('C:\\P\\alpha\\docs\\product\\demo\\index.html');

    const before = (api.docs.list as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => { for (const cb of listeners.docs) cb(); });
    await waitFor(() => expect((api.docs.list as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before));

    fireEvent.click(screen.getByRole('tab', { name: '終端機' }));
    expect(screen.getByTestId('terminal')).not.toHaveAttribute('hidden');
  });

  it('returns to the terminal tab and clears the selected doc when switching projects', async () => {
    const listeners: Listeners = { state: [], exit: [], idle: [], docs: [] };
    const alpha = projectAt('alpha', 'design');
    alpha.state!.stages.design.docs = ['docs/product/prd.md'];
    const beta = projectAt('beta', 'env', 'pending');
    const api = mockApi({
      listProjects: vi.fn(async () => [alpha, beta]),
      openProject: vi.fn(async (path: string) => (path.endsWith('alpha') ? alpha : beta)),
      docs: { list: vi.fn(async () => [{ rel: 'docs/product/prd.md', size: 1, mtimeMs: 1 }]), read: vi.fn(async () => '# PRD'), write: vi.fn(async () => {}) },
    }, listeners);
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    fireEvent.click(await screen.findByRole('button', { name: 'docs/product/prd.md' }));
    expect(screen.getByRole('tab', { name: '文件' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByText('beta'));
    await waitFor(() => expect(screen.getByRole('tab', { name: '終端機' })).toHaveAttribute('aria-selected', 'true'));
    expect(screen.queryByText('docs/product/prd.md', { selector: '.center-title' })).toBeNull();
  });

  it('opens settings, saves non-root fields and applies them', async () => {
    const api = mockApi();
    await renderApp(api);
    fireEvent.click(await screen.findByRole('button', { name: '設定' }));
    fireEvent.change(screen.getByLabelText('終端機字型大小'), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({ termFontSize: 18 })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.setRoot).not.toHaveBeenCalled();
    expect(api.pty.kill).not.toHaveBeenCalled();
  });

  it('changing root closes the current project, clears the sessions and reloads the list', async () => {
    // 主行程的 updateConfig 回傳完整設定（含剛換掉的 root），mock 要跟著記住它
    let root = CFG.root;
    const api = mockApi({
      setRoot: vi.fn(async (r: string) => { root = r; return { ...CFG, root }; }),
      updateConfig: vi.fn(async (patch) => ({ ...CFG, root, ...patch })),
      listProjects: vi.fn(async () => [project('alpha')]),
    });
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await screen.findAllByText(/環境搭建/);   // StagePanel 同時有標題與按鈕，只要等專案開好
    await waitFor(() => expect(screen.getAllByTestId('session')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    fireEvent.change(screen.getByLabelText('專案根目錄'), { target: { value: 'D:\\Other' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(api.setRoot).toHaveBeenCalledWith('D:\\Other'));
    await waitFor(() => expect(api.listProjects).toHaveBeenCalledTimes(2));
    // 主行程在 config:setRoot 裡就殺掉了；舊路徑已在新 root 之外，renderer 再殺只會被守衛拒絕
    expect(api.pty.kill).not.toHaveBeenCalled();
    expect(screen.getByText('選擇或建立一個專案')).toBeInTheDocument();
    expect(screen.getByText('D:\\Other')).toBeInTheDocument();
    // 換根目錄就是換掉所有 session：終端機不該再留著舊專案的實例
    expect(screen.queryAllByTestId('session')).toHaveLength(0);
    expect(api.pty.focus).toHaveBeenLastCalledWith(null);
  });

  it('keeps the new root when updateConfig fails after setRoot', async () => {
    const api = mockApi({
      setRoot: vi.fn(async () => ({ ...CFG, root: 'D:\\Other' })),
      updateConfig: vi.fn(async () => { throw new Error('disk full'); }),
    });
    await renderApp(api);
    await screen.findByText('alpha');
    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    fireEvent.change(screen.getByLabelText('專案根目錄'), { target: { value: 'D:\\Other' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    // 根目錄已經換掉了：對話框留著顯示錯誤，但畫面必須跟著新的根目錄走
    expect(await screen.findByText('disk full')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('D:\\Other')).toBeInTheDocument();
    expect(api.listProjects).toHaveBeenCalledTimes(2);
  });

  it('keeps the dialog open with the error when setRoot fails', async () => {
    const api = mockApi({ setRoot: vi.fn(async () => { throw new Error('root not found: D:\\Nope'); }) });
    await renderApp(api);
    fireEvent.click(await screen.findByRole('button', { name: '設定' }));
    fireEvent.change(screen.getByLabelText('專案根目錄'), { target: { value: 'D:\\Nope' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    expect(await screen.findByText('root not found: D:\\Nope')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(api.updateConfig).not.toHaveBeenCalled();
  });

  it('sidebar 洞察 opens the insights tab without a project', async () => {
    const api = mockApi();
    await renderApp(api);
    fireEvent.click(await screen.findByRole('button', { name: '📊 洞察' }));
    expect(screen.getByRole('tab', { name: '洞察' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('insights')).not.toHaveAttribute('hidden');
  });

  it('revealing a commit in another project opens that project and hands the hash to the git panel', async () => {
    mockGitPanel();
    const alpha = projectAt('alpha', 'design');
    const beta = projectAt('beta', 'build');
    const api = mockApi({
      listProjects: vi.fn(async () => [alpha, beta]),
      openProject: vi.fn(async (path: string) => (path.endsWith('alpha') ? alpha : beta)),
    });
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await screen.findByRole('button', { name: /產品設計/ });
    fireEvent.click(screen.getByRole('button', { name: '📊 洞察' }));
    fireEvent.click(screen.getByRole('button', { name: 'reveal' }));
    await waitFor(() => expect(api.openProject).toHaveBeenLastCalledWith('C:\\P\\beta'));
    await waitFor(() => expect(screen.getByText('abc1234', { selector: '.reveal' })).toBeInTheDocument());
    expect(screen.getByText('beta').closest('.project')).toHaveClass('active');
  });

  it('switching projects keeps the first session alive and focuses the new one', async () => {
    const alpha = projectAt('alpha', 'design');
    const beta = projectAt('beta', 'design');
    const api = mockApi({
      listProjects: vi.fn(async () => [alpha, beta]),
      openProject: vi.fn(async (p: string) => (p.endsWith('alpha') ? alpha : beta)),
    });
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\alpha', expect.anything()));
    fireEvent.click(screen.getByText('beta'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\beta', expect.anything()));
    expect(api.pty.kill).not.toHaveBeenCalled();
    expect(api.pty.focus).toHaveBeenLastCalledWith('C:\\P\\beta');
    expect(screen.getByText('alpha').closest('.project')).toHaveTextContent('● 執行中');

    fireEvent.click(screen.getByText('alpha'));
    await waitFor(() => expect(api.pty.focus).toHaveBeenLastCalledWith('C:\\P\\alpha'));
    await waitFor(() => expect(screen.getByTestId('terminal')).toHaveAttribute('data-current', 'C:\\P\\alpha'));
    expect(api.pty.start).toHaveBeenCalledTimes(2);   // 切回去不重啟
    expect(screen.getAllByTestId('session')).toHaveLength(2);
  });

  it('idle for a background session shows its waiting pill without enabling the current stage button', async () => {
    mockGitPanel();
    const listeners: Listeners = { state: [], exit: [], idle: [], docs: [] };
    const alpha = projectAt('alpha', 'design');
    const beta = projectAt('beta', 'design');
    const api = mockApi({
      listProjects: vi.fn(async () => [alpha, beta]),
      openProject: vi.fn(async (p: string) => (p.endsWith('alpha') ? alpha : beta)),
    }, listeners);
    await renderApp(api);
    fireEvent.click(await screen.findByText('beta'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\beta', expect.anything()));
    fireEvent.click(screen.getByText('alpha'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\alpha', expect.anything()));

    act(() => { for (const cb of listeners.idle) cb('C:\\P\\beta', true); });
    expect(screen.getByText('beta').closest('.project')).toHaveTextContent('● 等待回覆');
    expect(screen.getByText('alpha').closest('.project')).toHaveTextContent('● 執行中');
    // 背景專案在等回覆，不代表目前專案可以送指令
    expect(screen.getByRole('button', { name: /產品設計/ })).toBeDisabled();

    act(() => { for (const cb of listeners.idle) cb('C:\\P\\alpha', true); });
    expect(screen.getByRole('button', { name: /產品設計/ })).toBeEnabled();
  });

  it('session limit: dialog lists live sessions and closing one launches the pending project', async () => {
    const list = ['p1', 'p2', 'p3', 'p4', 'p5'].map((n) => projectAt(n, 'design'));
    const live = new Set<string>();
    const api = mockApi({
      listProjects: vi.fn(async () => list),
      openProject: vi.fn(async (path: string) => list.find((p) => p.path === path)!),
    });
    // 主行程的上限行為：已有 4 個 session 時，開第 5 個會被拒絕
    api.pty.start = vi.fn(async (path: string) => {
      if (!live.has(path) && live.size >= 4) throw new Error("Error invoking remote method 'pty:start': Error: too many sessions");
      live.add(path);
    });
    api.pty.kill = vi.fn(async (path: string) => { live.delete(path); });
    // 對話框的清單來自主行程的 pty:list，名稱是 label（路徑尾端）
    api.pty.list = vi.fn(async () => [...live].map((path) => ({ path, label: path.split('\\').pop()!, running: true, idle: false })));
    await renderApp(api);
    for (const n of ['p1', 'p2', 'p3', 'p4']) {
      fireEvent.click(await screen.findByText(n));
      await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith(`C:\\P\\${n}`, expect.anything()));
    }
    fireEvent.click(screen.getByText('p5'));
    const dialog = await screen.findByRole('dialog', { name: 'session 上限' });
    expect(within(dialog).getAllByRole('button', { name: '關閉' })).toHaveLength(4);

    const row = within(dialog).getByText('p1', { selector: '.name' }).closest('.session-row')!;
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: '關閉' }));
    await waitFor(() => expect(api.pty.kill).toHaveBeenCalledWith('C:\\P\\p1'));
    await waitFor(() => expect(api.pty.start).toHaveBeenLastCalledWith('C:\\P\\p5', expect.anything()));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'session 上限' })).toBeNull());
    expect(screen.getByText('p1').closest('.project')).not.toHaveTextContent('● 執行中');
    expect(screen.getByText('p5').closest('.project')).toHaveTextContent('● 執行中');
  });

  it('adopts the sessions the main process still has at mount', async () => {
    const alpha = projectAt('alpha', 'design');
    const api = mockApi({ listProjects: vi.fn(async () => [alpha]), openProject: vi.fn(async () => alpha) });
    api.pty.list = vi.fn(async () => [{ path: alpha.path, label: 'alpha', running: true, idle: false }]);
    await renderApp(api);
    // renderer 重載後主行程還留著的 session 直接接手：側欄馬上是執行中
    const row = (await screen.findByText('alpha')).closest('.project') as HTMLElement;
    expect(row).toHaveTextContent('● 執行中');
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByTestId('terminal')).toHaveAttribute('data-current', 'C:\\P\\alpha'));
    expect(api.pty.start).not.toHaveBeenCalled();
  });

  it('closing the current session shows the exited overlay; closing a background one removes its pill', async () => {
    mockGitPanel();
    const alpha = projectAt('alpha', 'design');
    const beta = projectAt('beta', 'design');
    const api = mockApi({
      listProjects: vi.fn(async () => [alpha, beta]),
      openProject: vi.fn(async (p: string) => (p.endsWith('alpha') ? alpha : beta)),
    });
    await renderApp(api);
    fireEvent.click(await screen.findByText('beta'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\beta', expect.anything()));
    fireEvent.click(screen.getByText('alpha'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\alpha', expect.anything()));

    // 背景專案：關掉之後連 xterm 實例都不留
    const betaRow = screen.getByText('beta').closest('.project') as HTMLElement;
    fireEvent.click(within(betaRow).getByRole('button', { name: '關閉 session' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認' }));
    await waitFor(() => expect(api.pty.kill).toHaveBeenCalledWith('C:\\P\\beta'));
    await waitFor(() => expect(screen.getAllByTestId('session')).toHaveLength(1));
    expect(screen.getByText('beta').closest('.project')).not.toHaveTextContent('● 執行中');
    expect(screen.getByText('已關閉 beta 的 session')).toHaveClass('notice');
    expect(screen.getByText('alpha').closest('.project')).toHaveClass('active');

    // 目前專案：留著 session（xterm 內容還在），只切成 exited 讓覆蓋層出現
    const alphaRow = screen.getByText('alpha').closest('.project') as HTMLElement;
    fireEvent.click(within(alphaRow).getByRole('button', { name: '關閉 session' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認' }));
    await waitFor(() => expect(api.pty.kill).toHaveBeenCalledWith('C:\\P\\alpha'));
    await waitFor(() => expect(screen.getByTestId('terminal')).toHaveAttribute('data-status', 'exited'));
    expect(screen.getAllByTestId('session')).toHaveLength(1);
    expect(screen.getByText('alpha').closest('.project')).not.toHaveTextContent('● 執行中');
  });

  it('cancelling the close dialog keeps the session running', async () => {
    const alpha = projectAt('alpha', 'design');
    const api = mockApi({ listProjects: vi.fn(async () => [alpha]), openProject: vi.fn(async () => alpha) });
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\alpha', expect.anything()));
    const row = screen.getByText('alpha').closest('.project') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: '關閉 session' }));
    fireEvent.click(await screen.findByRole('button', { name: '取消' }));
    expect(api.pty.kill).not.toHaveBeenCalled();
    expect(screen.getByText('alpha').closest('.project')).toHaveTextContent('● 執行中');
  });

  it('--continue retry applies per session', async () => {
    const listeners: Listeners = { state: [], exit: [], idle: [], docs: [] };
    const alpha = projectAt('alpha', 'design');
    const beta = projectAt('beta', 'design');
    const api = mockApi({
      listProjects: vi.fn(async () => [alpha, beta]),
      openProject: vi.fn(async (p: string) => (p.endsWith('alpha') ? alpha : beta)),
    }, listeners);
    await renderApp(api);
    fireEvent.click(await screen.findByText('beta'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\beta', expect.objectContaining({ continue: true })));
    fireEvent.click(screen.getByText('alpha'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\alpha', expect.objectContaining({ continue: true })));

    // 背景 session 的 --continue 失敗只重試它自己一次
    await act(async () => { listeners.exit.forEach((cb) => cb('C:\\P\\beta', 1)); });
    await waitFor(() => expect(api.pty.start).toHaveBeenLastCalledWith('C:\\P\\beta', expect.objectContaining({ continue: false })));
    expect(api.pty.start).toHaveBeenCalledTimes(3);
    await act(async () => { listeners.exit.forEach((cb) => cb('C:\\P\\beta', 1)); });
    expect(api.pty.start).toHaveBeenCalledTimes(3);
    expect(screen.getByText('beta').closest('.project')).not.toHaveTextContent('● 執行中');
    // 目前專案不受影響
    expect(screen.getByTestId('terminal')).toHaveAttribute('data-status', 'running');
  });

  it('changing root drops every session without killing from the renderer', async () => {
    let root = CFG.root;
    const alpha = projectAt('alpha', 'design');
    const beta = projectAt('beta', 'design');
    const api = mockApi({
      listProjects: vi.fn(async () => [alpha, beta]),
      openProject: vi.fn(async (p: string) => (p.endsWith('alpha') ? alpha : beta)),
      setRoot: vi.fn(async (r: string) => { root = r; return { ...CFG, root }; }),
      updateConfig: vi.fn(async (patch) => ({ ...CFG, root, ...patch })),
    });
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\alpha', expect.anything()));
    fireEvent.click(screen.getByText('beta'));
    await waitFor(() => expect(screen.getAllByTestId('session')).toHaveLength(2));

    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    fireEvent.change(screen.getByLabelText('專案根目錄'), { target: { value: 'D:\\Other' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存' }));
    await waitFor(() => expect(screen.queryAllByTestId('session')).toHaveLength(0));
    expect(api.pty.kill).not.toHaveBeenCalled();
  });

  it('kills sessions whose project is gone after a refresh', async () => {
    const alpha = projectAt('alpha', 'design');
    const beta = projectAt('beta', 'design');
    let listed = [alpha, beta];
    const api = mockApi({
      listProjects: vi.fn(async () => listed),
      openProject: vi.fn(async (p: string) => (p.endsWith('alpha') ? alpha : beta)),
      createProject: vi.fn(async (name: string) => project(name)),
    });
    await renderApp(api);
    fireEvent.click(await screen.findByText('beta'));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\beta', expect.anything()));
    listed = [alpha];   // beta 被刪掉了
    fireEvent.click(screen.getByRole('button', { name: '+ 新專案' }));
    fireEvent.change(screen.getByLabelText('專案名稱'), { target: { value: 'gamma' } });
    fireEvent.click(screen.getByRole('button', { name: '建立' }));
    await waitFor(() => expect(api.pty.kill).toHaveBeenCalledWith('C:\\P\\beta'));
  });
});

describe('App (git panel polish)', () => {
  it('passes the current stage to the git panel', async () => {
    mockGitPanel();
    const alpha = projectAt('alpha', 'design');
    const api = mockApi({ listProjects: vi.fn(async () => [alpha]), openProject: vi.fn(async () => alpha) });
    await renderApp(api);
    await screen.findByText('alpha');
    expect(screen.getByTestId('git-panel')).toHaveAttribute('data-stage', '');
    fireEvent.click(screen.getByText('alpha'));
    await waitFor(() => expect(screen.getByTestId('git-panel')).toHaveAttribute('data-stage', 'design'));
  });
});

describe('App (clone from url)', () => {
  it('clones a project from the dialog, re-lists and opens it', async () => {
    let listed = [project('alpha')];
    const api = mockApi({
      listProjects: vi.fn(async () => listed),
      cloneProject: vi.fn(async (_source: string, name: string) => {
        const p = { ...project(name), initialized: false, state: null };
        listed = [...listed, p];
        return p;
      }),
    });
    await renderApp(api);
    fireEvent.click(await screen.findByRole('button', { name: '+ 新專案' }));
    fireEvent.click(screen.getByRole('button', { name: '從 URL 複製' }));
    fireEvent.change(screen.getByLabelText('來源網址或路徑'), { target: { value: 'https://github.com/a/my-repo.git' } });
    expect(screen.getByLabelText('專案名稱')).toHaveValue('my-repo');
    fireEvent.click(screen.getByRole('button', { name: '複製' }));
    await waitFor(() => expect(api.cloneProject).toHaveBeenCalledWith('https://github.com/a/my-repo.git', 'my-repo'));
    await waitFor(() => expect(api.openProject).toHaveBeenCalledWith('C:\\P\\my-repo'));
    expect(api.listProjects).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '新專案' })).not.toBeInTheDocument());
    expect(screen.getByText('my-repo', { selector: '.project .name' })).toBeInTheDocument();
  });

  it('keeps the dialog open with the error when the clone fails', async () => {
    const api = mockApi({ cloneProject: vi.fn(async () => { throw new Error("Error invoking remote method 'projects:clone': Error: invalid clone source"); }) });
    await renderApp(api);
    fireEvent.click(await screen.findByRole('button', { name: '+ 新專案' }));
    fireEvent.click(screen.getByRole('button', { name: '從 URL 複製' }));
    fireEvent.change(screen.getByLabelText('來源網址或路徑'), { target: { value: 'https://github.com/a/x.git' } });
    fireEvent.click(screen.getByRole('button', { name: '複製' }));
    expect(await screen.findByText('invalid clone source')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '新專案' })).toBeInTheDocument();
    expect(api.openProject).not.toHaveBeenCalled();
  });
});
