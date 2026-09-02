import { describe, it, expect } from 'vitest';
import { assertBranch, assertDiffMode, assertHash, assertMessage, assertRelPath, validateGitAction } from './git-validate';

describe('assertRelPath', () => {
  it('accepts repo-relative paths including trailing slash, spaces and backslashes', () => {
    for (const p of ['a.txt', 'src/a b.txt', 'dir/', 'src\\win.txt', '.gitignore', '中文.txt']) expect(assertRelPath(p)).toBe(p);
  });

  it('rejects absolute, parent, option-like and malformed paths', () => {
    const bad: unknown[] = ['', '../x', 'a/../b', 'C:\\x', '/etc/passwd', '\\\\server\\share', '-rf', 'a//b', 'a\0b', 42, null];
    for (const p of bad) expect(() => assertRelPath(p)).toThrow(/invalid path/);
  });
});

describe('assertBranch', () => {
  it('accepts normal names', () => {
    for (const b of ['main', 'feature/login', 'v1.2', 'fix-1_2']) expect(assertBranch(b)).toBe(b);
  });

  it('rejects option-like names and ref-format violations', () => {
    const bad = ['', '-f', '--force', 'a b', 'a..b', 'a/', '.hidden', 'a.lock', 'a~1', 'a^', 'a:b', 'a?', 'a*', 'a[1]', 'a\\b', 'x@{1}', 'a//b', 'a.', 'a/.b'];
    for (const b of bad) expect(() => assertBranch(b)).toThrow(/invalid branch/);
  });
});

describe('assertHash / assertMessage / assertDiffMode', () => {
  it('accepts sane values and rejects the rest', () => {
    expect(assertHash('abc1234')).toBe('abc1234');
    expect(assertHash('ABCDEF0')).toBe('ABCDEF0');
    for (const h of ['', 'abc', '--output=x', 'HEAD', 'g'.repeat(7)]) expect(() => assertHash(h)).toThrow(/invalid hash/);
    expect(assertMessage('feat: x\n\nbody')).toBe('feat: x\n\nbody');
    for (const m of ['', '   ', 'x'.repeat(10_001), 'a\0b', 5]) expect(() => assertMessage(m)).toThrow(/invalid message/);
    expect(assertDiffMode('staged')).toBe('staged');
    expect(() => assertDiffMode('weird')).toThrow(/invalid diff mode/);
  });
});

describe('validateGitAction', () => {
  it('rebuilds a clean object and drops unknown fields', () => {
    expect(validateGitAction({ kind: 'stage', file: 'a.txt', extra: 1 })).toEqual({ kind: 'stage', file: 'a.txt' });
    expect(validateGitAction({ kind: 'commit', message: 'x' })).toEqual({ kind: 'commit', message: 'x', amend: false });
    expect(validateGitAction({ kind: 'discard', file: 'a', untracked: 'yes' })).toEqual({ kind: 'discard', file: 'a', untracked: false });
    expect(validateGitAction({ kind: 'push' })).toEqual({ kind: 'push' });
    expect(validateGitAction({ kind: 'merge', branch: 'dev' })).toEqual({ kind: 'merge', branch: 'dev' });
  });

  it('rejects unknown kinds and bad fields', () => {
    expect(() => validateGitAction(null)).toThrow(/invalid action/);
    expect(() => validateGitAction('push')).toThrow(/invalid action/);
    expect(() => validateGitAction({ kind: 'reset', mode: 'hard' })).toThrow(/invalid action/);
    expect(() => validateGitAction({ kind: 'switch', branch: '--force' })).toThrow(/invalid branch/);
    expect(() => validateGitAction({ kind: 'stage', file: '../x' })).toThrow(/invalid path/);
    expect(() => validateGitAction({ kind: 'commit', message: '  ' })).toThrow(/invalid message/);
  });
});
