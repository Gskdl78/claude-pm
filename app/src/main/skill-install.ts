import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { GitResult, SkillCollision, SkillInstall, SkillScope } from '../shared/types';
import { deriveSkillStatus } from '../shared/skill-state';
import { addExclude, hasExclude, removeExclude } from './skill-exclude';
import { copySkillTree } from './skill-copy';
import { assertInsideRoot } from './paths';
import { NAME_RE } from './projects';
import { runGit } from './git-run';

export function projectSkillsDir(projectPath: string): string {
  return join(projectPath, '.claude', 'skills');
}

export function globalSkillsDir(home: string = homedir()): string {
  return join(home, '.claude', 'skills');
}

function pluginCacheDir(home: string): string {
  return join(home, '.claude', 'plugins', 'cache');
}

export function assertSkillName(v: unknown): string {
  if (typeof v !== 'string' || !NAME_RE.test(v)) throw new Error('invalid skill name');
  return v;
}

/** 目錄底下的子資料夾名；目錄不存在或讀不到就回空陣列。 */
function subdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export function findCollisions(name: string, projectPath: string | null, home: string = homedir()): SkillCollision[] {
  const out: SkillCollision[] = [];
  if (projectPath) {
    const project = projectSkillsDir(projectPath);
    if (subdirs(project).includes(name)) out.push({ scope: 'project', where: join(project, name) });
  }
  const global = globalSkillsDir(home);
  if (subdirs(global).includes(name)) out.push({ scope: 'global', where: join(global, name) });
  // plugin cache 的形狀：<marketplace>/<plugin>/<version>/skills/<name>
  const cache = pluginCacheDir(home);
  for (const market of subdirs(cache)) {
    for (const plugin of subdirs(join(cache, market))) {
      for (const version of subdirs(join(cache, market, plugin))) {
        const dir = join(cache, market, plugin, version, 'skills');
        if (subdirs(dir).includes(name)) out.push({ scope: 'plugin', where: join(dir, name) });
      }
    }
  }
  return out;
}

/** 專案與全域兩邊的 skill 合起來的清單；needsRestart 由上層決定。 */
export function listInstalled(projectPath: string, home: string = homedir()): SkillInstall[] {
  const inProject = new Set(subdirs(projectSkillsDir(projectPath)));
  const inGlobal = new Set(subdirs(globalSkillsDir(home)));
  const names = [...new Set([...inProject, ...inGlobal])].sort();
  return names.map((name) => ({
    name,
    status: deriveSkillStatus(inProject.has(name), hasExclude(projectPath, name), inGlobal.has(name)),
    needsRestart: false,
  }));
}

/** SKILL.md 的 frontmatter name 換成新名字；沒有 name 那一行就原樣不動。 */
function rewriteName(dir: string, name: string): void {
  const file = join(dir, 'SKILL.md');
  if (!existsSync(file)) return;
  const md = readFileSync(file, 'utf8');
  writeFileSync(file, md.replace(/^(name:).*$/m, `$1 ${name}`));
}

export function installTrial(srcDir: string, projectPath: string, name: string, renameTo?: string | null): void {
  const target = assertSkillName(renameTo ?? name);
  const root = projectSkillsDir(projectPath);
  const dest = assertInsideRoot(root, join(root, target));
  if (existsSync(dest)) throw new Error('skill name exists');
  mkdirSync(root, { recursive: true });
  copySkillTree(srcDir, dest);
  if (renameTo) rewriteName(dest, target);
  addExclude(projectPath, target);
}

export function removeSkill(projectPath: string, name: string, scope: SkillScope, home: string = homedir()): void {
  const n = assertSkillName(name);
  const root = scope === 'project' ? projectSkillsDir(projectPath) : globalSkillsDir(home);
  const dir = assertInsideRoot(root, join(root, n));
  rmSync(dir, { recursive: true, force: true });
  if (scope === 'project') removeExclude(projectPath, n);
}

/** 拿掉 exclude 行後 git add + commit；專案不是 git repo 時直接丟錯。 */
export async function adoptSkill(projectPath: string, name: string): Promise<GitResult> {
  const n = assertSkillName(name);
  if (!existsSync(join(projectPath, '.git'))) throw new Error('not a git repo');
  removeExclude(projectPath, n);
  const rel = `.claude/skills/${n}`;
  const add = await runGit(projectPath, ['add', '--', rel]);
  if (!add.ok) return add;
  return runGit(projectPath, ['commit', '-m', `chore(skills): 採用 ${n}`, '--', rel]);
}

/**
 * 複製到全域後刪掉專案那份。已被 git 追蹤（採用過）時用 git rm 並 commit，
 * 回傳那個 commit 的結果；只是試用（未追蹤）就直接刪，回 null。
 */
export async function promoteSkill(projectPath: string, name: string, home: string = homedir()): Promise<GitResult | null> {
  const n = assertSkillName(name);
  const projectRoot = projectSkillsDir(projectPath);
  const src = assertInsideRoot(projectRoot, join(projectRoot, n));
  const globalRoot = globalSkillsDir(home);
  const dest = assertInsideRoot(globalRoot, join(globalRoot, n));
  if (existsSync(dest)) throw new Error('skill name exists');
  mkdirSync(globalRoot, { recursive: true });
  copySkillTree(src, dest);

  const rel = `.claude/skills/${n}`;
  const tracked = existsSync(join(projectPath, '.git'))
    && (await runGit(projectPath, ['ls-files', '--error-unmatch', '--', rel])).ok;
  if (!tracked) {
    rmSync(src, { recursive: true, force: true });
    removeExclude(projectPath, n);
    return null;
  }
  const rm = await runGit(projectPath, ['rm', '-r', '-q', '--', rel]);
  if (!rm.ok) return rm;
  return runGit(projectPath, ['commit', '-m', `chore(skills): ${n} 改為全域`, '--', rel]);
}
