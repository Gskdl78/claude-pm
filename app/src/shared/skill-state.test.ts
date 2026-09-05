import { describe, it, expect } from 'vitest';
import { deriveSkillStatus } from './skill-state';

describe('deriveSkillStatus', () => {
  it('maps the three booleans onto the four states', () => {
    expect(deriveSkillStatus(true, true, false)).toBe('trial');
    expect(deriveSkillStatus(true, false, false)).toBe('adopted');
    expect(deriveSkillStatus(false, false, true)).toBe('global');
    expect(deriveSkillStatus(false, false, false)).toBe('none');
  });

  it('lets the project copy win when a skill exists in both places', () => {
    // Claude Code 同名時吃專案那份，狀態顯示要跟著它
    expect(deriveSkillStatus(true, true, true)).toBe('trial');
    expect(deriveSkillStatus(true, false, true)).toBe('adopted');
  });
});
