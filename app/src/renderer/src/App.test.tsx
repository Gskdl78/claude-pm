import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import type { GitCommit, PmApi, ProjectInfo, StageName } from '../../shared/types';

vi.mock('./components/Terminal', () => ({
  Terminal: ({ status, onRestart }: { status: string; onRestart: () => void }) => (
    <div data-testid="terminal" data-status={status}><button onClick={onRestart}>重新啟動</button></div>
  ),
}));

// 只有檢查 notices 的測試才替換 GitPanel：其餘測試（含既有的 git 面板測試）仍用真的元件。
// App 在每個測試才動態 import，所以 doMock 必須在 renderApp 之前呼叫。
function mockGitPanel() {
  vi.doMock('./components/git/GitPanel', () => ({
    GitPanel: ({ notices }: { notices?: Array<{ id: number; text: string }> }) => (
      <div data-testid="git-panel">{(notices ?? []).map((n) => <div key={n.id} className="notice">{n.text}</div>)}</div>
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

type Listeners = { state: Array<(p: ProjectInfo) => void>; exit: Array<(c: number) => void>; idle: Array<(i: boolean) => void> };

function mockApi(overrides: Partial<PmApi> = {}, listeners: Listeners = { state: [], exit: [], idle: [] }): PmApi {
  const api: PmApi = {
    getConfig: vi.fn(async () => ({ root: 'C:\\P', lastProject: null, recent: [] })),
    setRoot: vi.fn(),
    checkClaude: vi.fn(async () => ({ ok: true, path: 'claude' })),
    listProjects: vi.fn(async () => [project('alpha')]),
    createProject: vi.fn(async (name: string) => project(name)),
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
    openExternal: vi.fn(async () => {}),
    onDocsChanged: vi.fn(() => () => {}),
    pty: {
      start: vi.fn(async () => {}),
      write: vi.fn(), resize: vi.fn(), kill: vi.fn(async () => {}),
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
    const listeners: Listeners = { state: [], exit: [], idle: [] };
    const api = mockApi({
      getConfig: vi.fn(async () => ({ root: 'C:\\P', lastProject: 'C:\\P\\beta', recent: [] })),
      listProjects: vi.fn(async () => [project('beta', 'done')]),
      openProject: vi.fn(async () => project('beta', 'done')),
    }, listeners);
    await renderApp(api);
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\beta', expect.objectContaining({ continue: true })));
    await act(async () => { listeners.exit.forEach((cb) => cb(1)); });
    await waitFor(() => expect(api.pty.start).toHaveBeenLastCalledWith('C:\\P\\beta', expect.objectContaining({ continue: false })));
    await act(async () => { listeners.exit.forEach((cb) => cb(0)); });
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
    const listeners: Listeners = { state: [], exit: [], idle: [] };
    const api = mockApi({
      getConfig: vi.fn(async () => ({ root: 'C:\\P', lastProject: 'C:\\P\\beta', recent: [] })),
      listProjects: vi.fn(async () => [project('beta', 'done')]),
      openProject: vi.fn(async () => project('beta', 'done')),
    }, listeners);
    await renderApp(api);
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledWith('C:\\P\\beta', expect.objectContaining({ continue: true })));

    // Well past the old 5s fallback window: the fallback must still happen.
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    await act(async () => { listeners.exit.forEach((cb) => cb(1)); });
    now.mockRestore();
    await waitFor(() => expect(api.pty.start).toHaveBeenLastCalledWith('C:\\P\\beta', expect.objectContaining({ continue: false })));
    expect(api.pty.start).toHaveBeenCalledTimes(2);

    // The fallback launch failing must not start yet another --continue launch.
    await act(async () => { listeners.exit.forEach((cb) => cb(1)); });
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
    const listeners: Listeners = { state: [], exit: [], idle: [] };
    const api = mockApi({}, listeners);
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await waitFor(() => expect(api.openProject).toHaveBeenCalled());
    const updated = project('alpha', 'done');
    updated.state!.stage = 'design';
    updated.state!.stages.design = { status: 'in_progress', docs: ['docs/product/prd.md'] };
    await act(async () => { listeners.state.forEach((cb) => cb(updated)); });
    expect(screen.getByText('產品設計')).toHaveClass('in_progress');
    fireEvent.click(screen.getByRole('button', { name: 'docs/product/prd.md' }));
    expect(api.openPath).toHaveBeenCalledWith('C:\\P\\alpha\\docs/product/prd.md');
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
    const listeners: Listeners = { state: [], exit: [], idle: [] };
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

    act(() => { for (const cb of listeners.idle) cb(true); });
    expect(btn).toBeEnabled();
    expect(screen.getByText('● 等待回覆')).toBeInTheDocument();

    // 指令與 Enter 必須分開寫入，合成一段會被 Claude Code 當成貼上而不送出。
    try {
      vi.useFakeTimers();
      fireEvent.click(btn);
      expect(api.pty.write).toHaveBeenNthCalledWith(1, '/stage-design');
      expect(api.pty.write).toHaveBeenCalledTimes(1);
      act(() => { vi.advanceTimersByTime(ENTER_DELAY_MS); });
      expect(api.pty.write).toHaveBeenNthCalledWith(2, '\r');
    } finally {
      vi.useRealTimers();
    }

    act(() => { for (const cb of listeners.idle) cb(false); });
    expect(btn).toBeDisabled();
    expect(screen.queryByText('● 等待回覆')).toBeNull();
  });

  it('flashes the stage row and posts a notice when the stage advances', async () => {
    mockGitPanel();
    const listeners: Listeners = { state: [], exit: [], idle: [] };
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
    const listeners: Listeners = { state: [], exit: [], idle: [] };
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
    const listeners: Listeners = { state: [], exit: [], idle: [] };
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
    const listeners: Listeners = { state: [], exit: [], idle: [] };
    const alpha = projectAt('alpha', 'design');
    const api = mockApi({ listProjects: vi.fn(async () => [alpha]), openProject: vi.fn(async () => alpha) }, listeners);
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await screen.findByRole('button', { name: /產品設計/ });
    act(() => { for (const cb of listeners.idle) cb(true); });
    expect(screen.getByText('● 等待回覆')).toBeInTheDocument();

    act(() => { for (const cb of listeners.exit) cb(0); });
    expect(screen.queryByText('● 等待回覆')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重新啟動' }));
    await waitFor(() => expect(api.pty.start).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('● 等待回覆')).toBeNull();
  });
});
