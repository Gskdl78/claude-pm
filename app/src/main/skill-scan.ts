import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import type { SkillFileInfo, SkillFinding, SkillReport } from '../shared/types';

export const MAX_SKILL_FILES = 200;
export const MAX_SKILL_BYTES = 2 * 1024 * 1024;
export const MAX_SKILL_FILE_BYTES = 512 * 1024;
/** 掃描根目錄本身算第 0 層，往下最多再找兩層（涵蓋 skills/<name>/SKILL.md）。 */
export const SCAN_DEPTH = 2;

const EXEC_EXT = new Set(['.sh', '.bash', '.ps1', '.bat', '.cmd', '.mjs', '.js', '.py']);

/** 值得讓使用者看一眼的樣式；命中不代表有問題，報告頁會標明這只是提示。 */
const RISK_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ['curl', /\bcurl\b/],
  ['wget', /\bwget\b/],
  ['Invoke-WebRequest', /\bInvoke-WebRequest\b/i],
  ['rm -rf', /\brm\s+-[a-z]*r[a-z]*f\b/],
  ['Remove-Item -Recurse', /\bRemove-Item\b[^\n]*-Recurse\b/i],
  ['base64', /\bbase64\b/],
  ['eval', /\beval\b/],
  ['chmod +x', /\bchmod\s+\+x\b/],
  ['git push', /\bgit\s+push\b/],
  ['npm install', /\bnpm\s+(?:install|i)\b/],
  ['pip install', /\bpip3?\s+install\b/],
];

const URL_RE = /https?:\/\/([A-Za-z0-9.-]+)/g;
/** 掃描時略過的目錄：版本庫內部與相依套件不是 skill 的一部分。 */
const SKIP_DIRS = new Set(['.git', 'node_modules']);

/** `---` 包起來的 key: value 區塊；沒有就回 null。值原樣保留（不解析 YAML 結構）。 */
export function parseFrontmatter(md: string): Record<string, string> | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(md);
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function tooLarge(): never {
  throw new Error('skill too large');
}

/** 一個 skill 資料夾底下的所有檔案（相對該資料夾），symlink 一律拒絕。 */
function walkFiles(dir: string, prefix = ''): SkillFileInfo[] {
  const out: SkillFileInfo[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) throw new Error('symlink in source');
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out.push(...walkFiles(full, rel));
      if (out.length > MAX_SKILL_FILES) tooLarge();
      continue;
    }
    if (!e.isFile()) continue;
    const st = lstatSync(full);
    if (st.size > MAX_SKILL_FILE_BYTES) tooLarge();
    out.push({ rel, bytes: st.size, lines: 0 });
    if (out.length > MAX_SKILL_FILES) tooLarge();
  }
  return out;
}

/** 二進位檔不掃樣式也不算行數；用開頭是否含 NUL 判斷，與 git-run 的 readUntracked 同一套。 */
function readText(full: string): string | null {
  const buf = readFileSync(full);
  if (buf.subarray(0, 8000).includes(0)) return null;
  return buf.toString('utf8');
}

function buildReport(root: string, dir: string): SkillReport {
  const skillMd = readFileSync(join(dir, 'SKILL.md'), 'utf8');
  const frontmatter = parseFrontmatter(skillMd);
  const name = frontmatter?.name ?? '';
  if (!frontmatter || !name) throw new Error('invalid frontmatter');

  const files = walkFiles(dir);
  const totalBytes = files.reduce((n, f) => n + f.bytes, 0);
  if (files.length > MAX_SKILL_FILES || totalBytes > MAX_SKILL_BYTES) tooLarge();

  const executables: string[] = [];
  const findings: SkillFinding[] = [];
  const hosts = new Set<string>();
  for (const f of files) {
    if (EXEC_EXT.has(extname(f.rel).toLowerCase())) executables.push(f.rel);
    const text = readText(join(dir, f.rel));
    if (text === null) continue;
    const lines = text.split('\n');
    f.lines = lines.length;
    lines.forEach((line, i) => {
      for (const [label, re] of RISK_PATTERNS) {
        if (re.test(line)) findings.push({ pattern: label, file: f.rel, line: i + 1 });
      }
      for (const m of line.matchAll(URL_RE)) hosts.add(m[1]!);
    });
  }

  return {
    name,
    dirName: basename(dir),
    nameMatchesDir: basename(dir) === name,
    description: frontmatter.description ?? '',
    frontmatter,
    rel: relative(root, dir).split('\\').join('/'),
    files,
    totalBytes,
    executables,
    findings,
    hosts: [...hosts].sort(),
    collisions: [],
    skillMd,
  };
}

/** 找 root 本身與其下最多 SCAN_DEPTH 層裡的 SKILL.md，依 name 排序回傳。 */
export function scanSkills(root: string): SkillReport[] {
  const dirs: string[] = [];
  const visit = (dir: string, depth: number): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isFile() && e.name === 'SKILL.md')) { dirs.push(dir); return; }
    if (depth >= SCAN_DEPTH) return;
    for (const e of entries) {
      if (e.isDirectory() && !e.isSymbolicLink() && !SKIP_DIRS.has(e.name)) visit(join(dir, e.name), depth + 1);
    }
  };
  visit(root, 0);
  if (dirs.length === 0) throw new Error('no skill found');
  return dirs.map((d) => buildReport(root, d)).sort((a, b) => a.name.localeCompare(b.name));
}
