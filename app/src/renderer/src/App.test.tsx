import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import type { PmApi, ProjectInfo } from '../../shared/types';

vi.mock('./components/Terminal', () => ({
  Terminal: ({ status, onRestart }: { status: string; onRestart: () => void }) => (
    <div data-testid="terminal" data-status={status}><button onClick={onRestart}>重新啟動</button></div>
  ),
}));

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

type Listeners = { state: Array<(p: ProjectInfo) => void>; exit: Array<(c: number) => void> };

function mockApi(overrides: Partial<PmApi> = {}, listeners: Listeners = { state: [], exit: [] }): PmApi {
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
    pty: {
      start: vi.fn(async () => {}),
      write: vi.fn(), resize: vi.fn(), kill: vi.fn(async () => {}),
      onData: vi.fn(() => () => {}),
      onExit: vi.fn((cb) => { listeners.exit.push(cb); return () => {}; }),
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

beforeEach(() => { vi.resetModules(); });

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
    const listeners: Listeners = { state: [], exit: [] };
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

  it('surfaces a pty spawn failure', async () => {
    const api = mockApi();
    api.pty.start = vi.fn(async () => { throw new Error('spawn ENOENT'); });
    await renderApp(api);
    fireEvent.click(await screen.findByText('alpha'));
    await waitFor(() => expect(screen.getByTestId('terminal')).toHaveAttribute('data-status', 'exited'));
    expect(screen.getByText('spawn ENOENT')).toBeInTheDocument();
  });

  it('updates the stage panel when state changes arrive', async () => {
    const listeners: Listeners = { state: [], exit: [] };
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
});
