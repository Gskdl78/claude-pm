import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SKIP_DIRS = new Set(['.git', 'node_modules']);

/**
 * 複製一個 skill 資料夾。symlink 一律拒絕（clone 下來的連結可能指到來源外面），
 * .git 與 node_modules 不複製。不用 cpSync 是因為它會照抄 symlink。
 */
export function copySkillTree(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.isSymbolicLink()) throw new Error('symlink in source');
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      copySkillTree(join(src, e.name), join(dest, e.name));
      continue;
    }
    if (!e.isFile()) continue;
    copyFileSync(join(src, e.name), join(dest, e.name));
  }
}
