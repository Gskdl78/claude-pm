import type { SkillReport } from './types';

export const MAX_PROMPT_SKILL_MD = 64 * 1024;

function facts(r: SkillReport): string {
  const lines = [
    `名稱：${r.name}${r.nameMatchesDir ? '' : `（frontmatter 的 name 與資料夾名 ${r.dirName} 不一致）`}`,
    `說明：${r.description || '（無）'}`,
    `檔案：${r.files.length} 個，共 ${r.totalBytes} 位元組`,
    `可執行檔：${r.executables.length ? r.executables.join('、') : '（無）'}`,
    `連外網域：${r.hosts.length ? r.hosts.join('、') : '（無）'}`,
  ];
  if (r.findings.length) {
    lines.push('值得看一眼的樣式：');
    for (const f of r.findings) lines.push(`  - ${f.pattern}（${f.file}:${f.line}）`);
  }
  if (r.collisions.length) {
    lines.push(`同名的既有 skill：${r.collisions.map((c) => c.where).join('、')}`);
  }
  return lines.join('\n');
}

/** 組成要寫進終端機的一段提示；SKILL.md 過長只送開頭並註明。 */
export function buildAnalysisPrompt(source: string, r: SkillReport): string {
  const truncated = r.skillMd.length > MAX_PROMPT_SKILL_MD;
  const md = truncated ? r.skillMd.slice(0, MAX_PROMPT_SKILL_MD) : r.skillMd;
  return [
    `以下是我從 ${source} 取得的一個 Claude Code skill，還沒有安裝。請讀完後用繁體中文說明：`,
    '它是做什麼的、什麼情況會被觸發、會用到哪些工具、有沒有我該擔心的地方、和我現有的 skill 有沒有重疊。',
    '',
    '靜態掃描結果：',
    facts(r),
    '',
    `SKILL.md${truncated ? '（已截斷，只有開頭 64 KB）' : ''}：`,
    md,
  ].join('\n');
}
