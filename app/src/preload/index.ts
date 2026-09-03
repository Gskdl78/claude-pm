import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { PmApi } from '../shared/types';

function on<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as T));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: PmApi = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setRoot: (root) => ipcRenderer.invoke('config:setRoot', root),
  checkClaude: () => ipcRenderer.invoke('claude:check'),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  createProject: (name) => ipcRenderer.invoke('projects:create', name),
  initProject: (path) => ipcRenderer.invoke('projects:init', path),
  openProject: (path) => ipcRenderer.invoke('projects:open', path),
  rebuildState: (path) => ipcRenderer.invoke('projects:rebuild', path),
  getGitLog: (path, n) => ipcRenderer.invoke('git:log', path, n),
  openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
  git: {
    status: (path) => ipcRenderer.invoke('git:status', path),
    branches: (path) => ipcRenderer.invoke('git:branches', path),
    diff: (path, file, mode) => ipcRenderer.invoke('git:diff', path, file, mode),
    show: (path, hash) => ipcRenderer.invoke('git:show', path, hash),
    run: (path, action) => ipcRenderer.invoke('git:run', path, action),
    extras: (path) => ipcRenderer.invoke('git:extras', path),
  },
  gh: {
    check: (path) => ipcRenderer.invoke('gh:check', path),
    repoCreate: (path, name, isPrivate) => ipcRenderer.invoke('gh:repoCreate', path, name, isPrivate),
  },
  pty: {
    start: (path, opts) => ipcRenderer.invoke('pty:start', path, opts),
    write: (data) => ipcRenderer.send('pty:write', data),
    resize: (cols, rows) => ipcRenderer.send('pty:resize', cols, rows),
    kill: () => ipcRenderer.invoke('pty:kill'),
    onData: (cb) => on<[string]>('pty:data', cb),
    onExit: (cb) => on<[number]>('pty:exit', cb),
    onIdle: (cb) => on<[boolean]>('pty:idle', cb),
  },
  onStateChanged: (cb) => on('project:state', cb),
  onGitChanged: (cb) => on('project:git', cb),
};

contextBridge.exposeInMainWorld('pm', api);
