import type { StageName } from './types';

/** 候選前綴列（固定順序）；與 plugin/templates/CLAUDE.md 的 Git 規則一致。 */
export const COMMIT_PREFIXES: readonly string[] = ['chore(env): ', 'docs(design): ', 'docs(tech): ', 'feat: ', 'fix: ', 'test: ', 'fix(security): ', 'fix(verify): '];
const BY_STAGE: Record<StageName, string> = { env: 'chore(env): ', design: 'docs(design): ', tech: 'docs(tech): ', build: 'feat: ', verify: 'fix(verify): ' };

/** 目前階段建議的前綴；done 為 feat:，沒有 state（null）時不建議任何一個，前綴列就不高亮。 */
export function prefixForStage(stage: StageName | 'done' | null): string | null {
  if (stage === null) return null;
  return stage === 'done' ? 'feat: ' : BY_STAGE[stage];
}

/** 去掉開頭空白與第一個命中的候選前綴（含其後空白）再加上新前綴；只換最外層，不連續剝除。 */
export function applyPrefix(message: string, prefix: string): string {
  const trimmed = message.replace(/^\s+/, '');
  const hit = COMMIT_PREFIXES.find((p) => trimmed.startsWith(p.trim()));
  const stripped = hit ? trimmed.slice(hit.trim().length).replace(/^\s+/, '') : trimmed;
  return prefix + stripped;
}
