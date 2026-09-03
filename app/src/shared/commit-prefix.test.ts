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
    // 沒有 state：不建議任何前綴，CommitBox 的前綴列就不高亮（spec §3.3）
    expect(prefixForStage(null)).toBeNull();
    expect(COMMIT_PREFIXES).toContain('fix(security): ');
  });
  it('applyPrefix inserts, replaces an existing candidate prefix and never duplicates', () => {
    expect(applyPrefix('', 'feat: ')).toBe('feat: ');
    expect(applyPrefix('add login', 'feat: ')).toBe('feat: add login');
    expect(applyPrefix('feat: add login', 'fix: ')).toBe('fix: add login');
    expect(applyPrefix('fix:   add login', 'fix: ')).toBe('fix: add login');
    expect(applyPrefix('unrelated: text', 'feat: ')).toBe('feat: unrelated: text');
  });
  it('applyPrefix trims leading whitespace and only strips the first matching prefix', () => {
    expect(applyPrefix('  feat: x', 'fix: ')).toBe('fix: x');
    expect(applyPrefix('\n\tadd login', 'feat: ')).toBe('feat: add login');
    // 訊息本身以另一個候選前綴開頭：只換最外層，剩下的原封不動
    expect(applyPrefix('feat: fix: x', 'test: ')).toBe('test: fix: x');
  });
});
