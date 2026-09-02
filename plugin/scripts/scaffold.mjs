#!/usr/bin/env node
// 把 pm-workflow 種入一個專案資料夾。
// 用法：node scaffold.mjs <targetDir> [name] [--no-git]
import {
  cpSync, existsSync, mkdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { initialState, writeState, statePath } from './pm-state-lib.mjs';

export const PLUGIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
// Windows 保留裝置名稱：不分大小寫，含副檔名也不行（例如 nul.txt）。
export const RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function validateName(name) {
  if (typeof name !== 'string' || !NAME_RE.test(name) || name.endsWith('.') || RESERVED_RE.test(name)) {
    throw new Error(`invalid project name: "${name}" (英數開頭，僅允許英數 . _ -，最長 64，不可為 Windows 保留名稱或以 . 結尾)`);
  }
}

export function isInitialized(dir) {
  return existsSync(statePath(dir));
}

export function renderTemplate(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

function git(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

export function scaffoldProject({ targetDir, name = basename(targetDir), pluginDir = PLUGIN_DIR, git: useGit = true }) {
  validateName(name);
  if (isInitialized(targetDir)) throw new Error(`already initialized: ${targetDir}`);
  mkdirSync(targetDir, { recursive: true });

  cpSync(join(pluginDir, 'skills'), join(targetDir, '.claude', 'skills'), { recursive: true });

  mkdirSync(join(targetDir, '.pm'), { recursive: true });
  for (const f of ['pm-state.mjs', 'pm-state-lib.mjs']) {
    cpSync(join(pluginDir, 'scripts', f), join(targetDir, '.pm', f));
  }

  const claudeMd = join(targetDir, 'CLAUDE.md');
  if (!existsSync(claudeMd)) {
    const tpl = readFileSync(join(pluginDir, 'templates', 'CLAUDE.md'), 'utf8');
    writeFileSync(claudeMd, renderTemplate(tpl, { name, type: 'other', notes: '（尚無歷史注意事項）' }));
  }
  const gitignore = join(targetDir, '.gitignore');
  if (!existsSync(gitignore)) cpSync(join(pluginDir, 'templates', 'gitignore'), gitignore);

  writeState(targetDir, initialState(name));

  if (useGit) {
    if (!existsSync(join(targetDir, '.git'))) git(targetDir, ['init', '-b', 'main']);
    // 只加入本次種入的檔案，不要把使用者既有的未提交變更一起 commit。
    git(targetDir, ['add', '--', '.claude', '.pm', 'CLAUDE.md', '.gitignore']);
    git(targetDir, ['commit', '-q', '-m', 'chore: init project']);
  }
  return { targetDir, name };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const args = process.argv.slice(2);
    const useGit = !args.includes('--no-git');
    const positional = args.filter((a) => !a.startsWith('--'));
    if (!positional[0]) throw new Error('usage: scaffold.mjs <targetDir> [name] [--no-git]');
    const targetDir = resolve(positional[0]);
    const result = scaffoldProject({ targetDir, name: positional[1] ?? basename(targetDir), git: useGit });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (e) {
    process.stderr.write(`scaffold: ${e.message}\n`);
    process.exit(1);
  }
}
