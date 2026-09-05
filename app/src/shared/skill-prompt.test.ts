import { describe, it, expect } from 'vitest';
import type { SkillReport } from './types';
import { MAX_PROMPT_SKILL_MD, buildAnalysisPrompt } from './skill-prompt';

const base: SkillReport = {
  name: 'foo', dirName: 'foo', nameMatchesDir: true, description: 'd',
  frontmatter: { name: 'foo', description: 'd' }, rel: '',
  files: [{ rel: 'SKILL.md', bytes: 10, lines: 2 }], totalBytes: 10,
  executables: ['run.sh'], findings: [{ pattern: 'curl', file: 'run.sh', line: 3 }],
  hosts: ['example.com'], collisions: [], skillMd: '# short',
};

describe('buildAnalysisPrompt', () => {
  it('includes the source, the scan facts and the full SKILL.md', () => {
    const p = buildAnalysisPrompt('https://github.com/u/r', base);
    expect(p).toContain('https://github.com/u/r');
    expect(p).toContain('run.sh');
    expect(p).toContain('curl');
    expect(p).toContain('example.com');
    expect(p).toContain('# short');
    expect(p).not.toContain('已截斷');
  });

  it('truncates an oversized SKILL.md and says so', () => {
    const p = buildAnalysisPrompt('x', { ...base, skillMd: 'a'.repeat(MAX_PROMPT_SKILL_MD + 100) });
    expect(p).toContain('已截斷');
    expect(p.length).toBeLessThan(MAX_PROMPT_SKILL_MD + 2000);
  });

  it('mentions a name/folder mismatch and existing same-name skills', () => {
    const p = buildAnalysisPrompt('x', {
      ...base, nameMatchesDir: false, dirName: 'other',
      collisions: [{ scope: 'global', where: 'C:/Users/u/.claude/skills/foo' }],
    });
    expect(p).toContain('other');
    expect(p).toContain('C:/Users/u/.claude/skills/foo');
  });
});
