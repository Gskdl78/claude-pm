import type { StageName } from './types';

/** 候選前綴列（固定順序）；與 plugin/templates/CLAUDE.md 的 Git 規則一致。 */
export const COMMIT_PREFIXES: readonly string[] = ['chore(env): ', 'docs(design): ', 'docs(tech): ', 'feat: ', 'fix: ', 'test: ', 'fix(security): ', 'fix(verify): '];
const BY_STAGE: Record<StageName, string> = { env: 'chore(env): ', design: 'docs(design): ', tech: 'docs(tech): ', build: 'feat: ', verify: 'fix(verify): ' };

/** 目前階段建議的前綴；done 或沒有 state 時回 feat:。 */
export function prefixForStage(stage: StageName | 'done' | null): string {
  return stage && stage !== 'done' ? BY_STAGE[stage] : 'feat: ';
}

/** 去掉既有候選前綴（含其後空白）再加上新前綴。 */
export function applyPrefix(message: string, prefix: string): string {
  const stripped = COMMIT_PREFIXES.reduce((m, p) => (m.startsWith(p.trim()) ? m.slice(p.trim().length).replace(/^\s+/, '') : m), message);
  return prefix + stripped;
}
