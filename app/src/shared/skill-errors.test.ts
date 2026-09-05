import { describe, it, expect } from 'vitest';
import { explainSkillError } from './skill-errors';

describe('explainSkillError', () => {
  it('maps known messages to Chinese and keeps unknown ones null', () => {
    expect(explainSkillError('invalid skill source')).toMatch(/來源/);
    expect(explainSkillError('Error: skill too large')).toMatch(/上限/);
    expect(explainSkillError('no skill found')).toMatch(/SKILL.md/);
    expect(explainSkillError('something else entirely')).toBeNull();
  });
});
