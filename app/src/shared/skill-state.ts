import type { SkillStatus } from './types';

/**
 * 狀態不另外存檔，由三個事實推導：在專案的 .claude/skills 裡、在 .git/info/exclude 裡、在 ~/.claude/skills 裡。
 * 同時存在專案與全域時以專案為準——Claude Code 也是專案那份優先。
 */
export function deriveSkillStatus(inProject: boolean, excluded: boolean, inGlobal: boolean): SkillStatus {
  if (inProject) return excluded ? 'trial' : 'adopted';
  return inGlobal ? 'global' : 'none';
}
