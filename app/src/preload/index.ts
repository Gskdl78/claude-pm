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
  updateConfig: (patch) => ipcRenderer.invoke('config:update', patch),
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
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
  docs: {
    list: (path) => ipcRenderer.invoke('docs:list', path),
    read: (path, rel) => ipcRenderer.invoke('docs:read', path, rel),
    write: (path, rel, content) => ipcRenderer.invoke('docs:write', path, rel, content),
  },
  insights: {
    collect: () => ipcRenderer.invoke('insights:collect'),
    pinned: () => ipcRenderer.invoke('insights:pinned'),
    pin: (note) => ipcRenderer.invoke('insights:pin', note),
    unpin: (cause) => ipcRenderer.invoke('insights:unpin', cause),
  },
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  pty: {
    start: (path, opts) => ipcRenderer.invoke('pty:start', path, opts),
    write: (path, data) => ipcRenderer.send('pty:write', path, data),
    resize: (path, cols, rows) => ipcRenderer.send('pty:resize', path, cols, rows),
    kill: (path) => ipcRenderer.invoke('pty:kill', path),
    list: () => ipcRenderer.invoke('pty:list'),
    focus: (path) => ipcRenderer.send('pty:focus', path),
    onData: (cb) => on<[string, string]>('pty:data', cb),
    onExit: (cb) => on<[string, number]>('pty:exit', cb),
    onIdle: (cb) => on<[string, boolean]>('pty:idle', cb),
  },
  onStateChanged: (cb) => on('project:state', cb),
  onGitChanged: (cb) => on('project:git', cb),
  onDocsChanged: (cb) => on<[]>('project:docs', cb),
};

contextBridge.exposeInMainWorld('pm', api);
