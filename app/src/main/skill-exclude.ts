import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function excludePath(projectPath: string): string {
  return join(projectPath, '.git', 'info', 'exclude');
}

/** gitignore 樣式，相對 repo 根目錄；結尾的 / 表示只比對資料夾。 */
export function excludeLine(name: string): string {
  return `/.claude/skills/${name}/`;
}

function readLines(projectPath: string): string[] | null {
  const file = excludePath(projectPath);
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').split('\n');
}

export function hasExclude(projectPath: string, name: string): boolean {
  return (readLines(projectPath) ?? []).includes(excludeLine(name));
}

/** 專案不是 git repo（沒有 .git）時什麼都不做：沒有 git 就沒有東西要藏。 */
export function addExclude(projectPath: string, name: string): void {
  if (!existsSync(join(projectPath, '.git'))) return;
  if (hasExclude(projectPath, name)) return;
  const file = excludePath(projectPath);
  mkdirSync(dirname(file), { recursive: true });
  const body = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const sep = body.length === 0 || body.endsWith('\n') ? '' : '\n';
  writeFileSync(file, `${body}${sep}${excludeLine(name)}\n`);
}

export function removeExclude(projectPath: string, name: string): void {
  const lines = readLines(projectPath);
  if (!lines) return;
  const line = excludeLine(name);
  const kept = lines.filter((l) => l !== line);
  if (kept.length === lines.length) return;
  writeFileSync(excludePath(projectPath), kept.join('\n'));
}
