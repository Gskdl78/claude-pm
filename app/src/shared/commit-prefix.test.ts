import { describe, it, expect } from 'vitest';
import { COMMIT_PREFIXES, applyPrefix, prefixForStage } from './commit-prefix';

describe('commit prefixes', () => {
  it('maps stages to prefixes', () => {
    expect(prefixForStage('env')).toBe('chore(env): ');
    expect(prefixForStage('design')).toBe('docs(design): ');
    expect(prefixForStage('tech')).toBe('docs(tech): ');
    expect(prefixForStage('build')).toBe('feat: ');
    expect(prefixForStage('verify')).toBe('fix(verify): ');
    expect(prefixForStage('done')).toBe('feat: ');
    expect(prefixForStage(null)).toBe('feat: ');
    expect(COMMIT_PREFIXES).toContain('fix(security): ');
  });
  it('applyPrefix inserts, replaces an existing candidate prefix and never duplicates', () => {
    expect(applyPrefix('', 'feat: ')).toBe('feat: ');
    expect(applyPrefix('add login', 'feat: ')).toBe('feat: add login');
    expect(applyPrefix('feat: add login', 'fix: ')).toBe('fix: add login');
    expect(applyPrefix('fix:   add login', 'fix: ')).toBe('fix: add login');
    expect(applyPrefix('unrelated: text', 'feat: ')).toBe('feat: unrelated: text');
  });
});
