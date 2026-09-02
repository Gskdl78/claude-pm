import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { PmState, ProjectInfo } from '../shared/types';
import { runNodeScript } from './plugin-run';

export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function statePath(dir: string): string {
  return join(dir, '.pm', 'state.json');
}

export function readProjectInfo(dir: string): ProjectInfo {
  const p = statePath(dir);
  const info: ProjectInfo = { name: basename(dir), path: dir, initialized: existsSync(p), state: null };
  if (!info.initialized) return info;
  try {
    info.state = JSON.parse(readFileSync(p, 'utf8')) as PmState;
    if (!info.state || typeof info.state !== 'object' || !info.state.stages) {
      throw new Error('state.json 缺少 stages');
    }
  } catch (e) {
    info.state = null;
    info.stateError = e instanceof Error ? e.message : String(e);
  }
  return info;
}

export function listProjects(root: string): ProjectInfo[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => readProjectInfo(join(root, d.name)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function scaffoldScript(pluginDir: string): string {
  return join(pluginDir, 'scripts', 'scaffold.mjs');
}

export async function createProject(root: string, name: string, pluginDir: string): Promise<ProjectInfo> {
  if (!NAME_RE.test(name)) throw new Error(`invalid project name: ${name}`);
  const dir = join(root, name);
  if (existsSync(dir)) throw new Error(`folder already exists: ${dir}`);
  await runNodeScript(scaffoldScript(pluginDir), [dir, name]);
  return readProjectInfo(dir);
}

export async function initExisting(dir: string, pluginDir: string): Promise<ProjectInfo> {
  if (!existsSync(dir)) throw new Error(`folder not found: ${dir}`);
  if (existsSync(statePath(dir))) throw new Error(`already initialized: ${dir}`);
  await runNodeScript(scaffoldScript(pluginDir), [dir, basename(dir)]);
  return readProjectInfo(dir);
}

export async function rebuildState(dir: string, pluginDir: string): Promise<ProjectInfo> {
  await runNodeScript(join(pluginDir, 'scripts', 'pm-state.mjs'), ['rebuild', basename(dir)], dir);
  return readProjectInfo(dir);
}
