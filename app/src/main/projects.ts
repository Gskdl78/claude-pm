import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import type { PmState, ProjectInfo } from '../shared/types';
import { MAX_URL, REMOTE_URL_RE } from '../shared/git-validate';
import { explainGitError } from '../shared/git-errors';
import { runNodeScript } from './plugin-run';
import { runGit } from './git-run';

export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** clone 來源：https / git@ 網址，或既存的絕對本機目錄（本機複製）。放這裡是因為 shared 模組不能碰 node:fs。 */
export function assertCloneSource(v: unknown): string {
  if (typeof v !== 'string' || v.length === 0 || v.includes('\0')) throw new Error('invalid clone source');
  if (v.length <= MAX_URL && REMOTE_URL_RE.test(v)) return v;
  try {
    if (isAbsolute(v) && existsSync(v) && statSync(v).isDirectory()) return v;
  } catch { /* 讀不到就當不存在 */ }
  throw new Error('invalid clone source');
}

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

export interface ScaffoldVars { implModel: string; reviewModel: string; maxRetries: number; pinnedFile?: string }

/** 轉成 scaffold.mjs 的 CLI 旗標；沒有 vars 就用 plugin 的預設。 */
export function scaffoldArgs(vars?: ScaffoldVars): string[] {
  if (!vars) return [];
  const args = [`--impl-model=${vars.implModel}`, `--review-model=${vars.reviewModel}`, `--max-retries=${vars.maxRetries}`];
  if (vars.pinnedFile) args.push(`--pinned-file=${vars.pinnedFile}`);
  return args;
}

function scaffoldScript(pluginDir: string): string {
  return join(pluginDir, 'scripts', 'scaffold.mjs');
}

export async function createProject(root: string, name: string, pluginDir: string, vars?: ScaffoldVars): Promise<ProjectInfo> {
  if (!NAME_RE.test(name)) throw new Error(`invalid project name: ${name}`);
  const dir = join(root, name);
  if (existsSync(dir)) throw new Error(`folder already exists: ${dir}`);
  await runNodeScript(scaffoldScript(pluginDir), [dir, name, ...scaffoldArgs(vars)]);
  return readProjectInfo(dir);
}

/** 從網址或本機路徑複製到 root/<name>；只做 git clone，不自動初始化 pm（側欄仍會提供「初始化」）。 */
export async function cloneProject(root: string, source: string, name: string): Promise<ProjectInfo> {
  if (!NAME_RE.test(name)) throw new Error(`invalid project name: ${name}`);
  const dir = join(root, name);
  if (existsSync(dir)) throw new Error(`folder already exists: ${dir}`);
  const r = await runGit(root, ['clone', '--', source, dir]);
  if (!r.ok) throw new Error(explainGitError(`${r.stdout}\n${r.stderr}`) ?? (r.stderr.trim() || 'git clone 失敗'));
  return readProjectInfo(dir);
}

export async function initExisting(dir: string, pluginDir: string, vars?: ScaffoldVars): Promise<ProjectInfo> {
  if (!existsSync(dir)) throw new Error(`folder not found: ${dir}`);
  if (existsSync(statePath(dir))) throw new Error(`already initialized: ${dir}`);
  await runNodeScript(scaffoldScript(pluginDir), [dir, basename(dir), ...scaffoldArgs(vars)]);
  return readProjectInfo(dir);
}

export async function rebuildState(dir: string, pluginDir: string): Promise<ProjectInfo> {
  await runNodeScript(join(pluginDir, 'scripts', 'pm-state.mjs'), ['rebuild', basename(dir)], dir);
  return readProjectInfo(dir);
}
