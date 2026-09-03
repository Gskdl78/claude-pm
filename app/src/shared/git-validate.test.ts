import { describe, it, expect } from 'vitest';
import {
  assertBranch, assertDiffMode, assertHash, assertMessage, assertRelPath, assertRemoteUrl, assertRepoName,
  assertResetMode, assertResetTarget, assertStashIndex, assertStashMessage, assertTagName, validateGitAction,
  assertPatch, MAX_PATCH,
} from './git-validate';

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
    expect(() => validateGitAction({ kind: 'rebase' })).toThrow(/invalid action/);
    expect(() => validateGitAction({ kind: 'switch', branch: '--force' })).toThrow(/invalid branch/);
    expect(() => validateGitAction({ kind: 'stage', file: '../x' })).toThrow(/invalid path/);
    expect(() => validateGitAction({ kind: 'commit', message: '  ' })).toThrow(/invalid message/);
  });

  it('rebuilds batch-2 actions and rejects their bad fields', () => {
    expect(validateGitAction({ kind: 'stash' })).toEqual({ kind: 'stash', message: null });
    expect(validateGitAction({ kind: 'stash', message: '' })).toEqual({ kind: 'stash', message: null });
    expect(validateGitAction({ kind: 'stash', message: 'wip' })).toEqual({ kind: 'stash', message: 'wip' });
    expect(validateGitAction({ kind: 'stashPop', index: 2 })).toEqual({ kind: 'stashPop', index: 2 });
    expect(validateGitAction({ kind: 'stashDrop', index: 0, extra: true })).toEqual({ kind: 'stashDrop', index: 0 });
    expect(validateGitAction({ kind: 'reset', mode: 'hard', target: 'HEAD~2' })).toEqual({ kind: 'reset', mode: 'hard', target: 'HEAD~2' });
    expect(validateGitAction({ kind: 'revert', hash: 'abc1234' })).toEqual({ kind: 'revert', hash: 'abc1234' });
    expect(validateGitAction({ kind: 'tag', name: 'v1' })).toEqual({ kind: 'tag', name: 'v1', hash: null });
    expect(validateGitAction({ kind: 'tag', name: 'v1', hash: 'abc1234' })).toEqual({ kind: 'tag', name: 'v1', hash: 'abc1234' });
    expect(validateGitAction({ kind: 'deleteTag', name: 'v1' })).toEqual({ kind: 'deleteTag', name: 'v1' });
    expect(validateGitAction({ kind: 'abortMerge', x: 1 })).toEqual({ kind: 'abortMerge' });
    expect(validateGitAction({ kind: 'pullRebase' })).toEqual({ kind: 'pullRebase' });
    expect(validateGitAction({ kind: 'addRemote', url: 'git@github.com:o/r.git' })).toEqual({ kind: 'addRemote', url: 'git@github.com:o/r.git' });
    expect(() => validateGitAction({ kind: 'reset', mode: 'hard' })).toThrow(/invalid reset target/);
    expect(() => validateGitAction({ kind: 'reset', mode: 'wipe', target: 'HEAD~1' })).toThrow(/invalid reset mode/);
    expect(() => validateGitAction({ kind: 'stashPop', index: '0' })).toThrow(/invalid stash index/);
    expect(() => validateGitAction({ kind: 'revert', hash: 'HEAD' })).toThrow(/invalid hash/);
    expect(() => validateGitAction({ kind: 'tag', name: '-d' })).toThrow(/invalid tag name/);
    expect(() => validateGitAction({ kind: 'addRemote', url: 'ssh://git@github.com/o/r' })).toThrow(/invalid remote url/);
  });
});

describe('batch-2 validators', () => {
  it('accepts HEAD~n or a hash as reset target and the three reset modes', () => {
    for (const t of ['HEAD~1', 'HEAD~25', 'HEAD~999', 'abc1234', 'ABCDEF0123']) expect(assertResetTarget(t)).toBe(t);
    const bad: unknown[] = ['', 'HEAD', 'HEAD~0', 'HEAD~1000', 'head~1', 'HEAD^', 'HEAD~1 --hard', '--hard', 'main', 42];
    for (const t of bad) expect(() => assertResetTarget(t)).toThrow(/invalid reset target/);
    for (const m of ['soft', 'mixed', 'hard']) expect(assertResetMode(m)).toBe(m);
    for (const m of ['', 'merge', 'HARD', null]) expect(() => assertResetMode(m)).toThrow(/invalid reset mode/);
  });

  it('bounds stash indexes and messages, validates tag names', () => {
    expect(assertStashIndex(0)).toBe(0);
    expect(assertStashIndex(999)).toBe(999);
    for (const i of [-1, 1000, 1.5, '0', Number.NaN, null]) expect(() => assertStashIndex(i)).toThrow(/invalid stash index/);
    expect(assertStashMessage(null)).toBeNull();
    expect(assertStashMessage(undefined)).toBeNull();
    expect(assertStashMessage('')).toBeNull();
    expect(assertStashMessage('wip: 登入')).toBe('wip: 登入');
    for (const m of ['   ', 'a\nb', 'x'.repeat(201), 'a\0b', 7]) expect(() => assertStashMessage(m)).toThrow(/invalid stash message/);
    expect(assertTagName('v1.2.0')).toBe('v1.2.0');
    for (const t of ['', '-d', 'v 1', 'a..b', 'v1.lock']) expect(() => assertTagName(t)).toThrow(/invalid tag name/);
  });

  it('accepts only https or git@ remote urls without spaces, credentials or control characters', () => {
    const good = ['https://github.com/o/r.git', 'https://github.com/o/r', 'https://gitlab.example.com:8443/group/sub/r.git', 'git@github.com:o/r.git', 'git@github.com:o/r'];
    for (const u of good) expect(assertRemoteUrl(u)).toBe(u);
    const bad: unknown[] = ['', 'http://github.com/o/r', 'ssh://git@github.com/o/r', 'github.com/o/r', 'https://github.com/o/r x', 'https://github.com/o/r\n',
      'https://user:pw@github.com/o/r', '--upload-pack=calc', 'ext::sh -c calc', 'file:///C:/x', 'git@github.com:o/r;calc', `https://github.com/o/${'r'.repeat(2048)}`,
      'git@-oProxyCommand=x:a/b', 5];
    for (const u of bad) expect(() => assertRemoteUrl(u)).toThrow(/invalid remote url/);
  });

  it('validates GitHub repo names', () => {
    for (const n of ['claude-pm', 'my_app.v2', 'A']) expect(assertRepoName(n)).toBe(n);
    for (const n of ['', '-x', '.', '..', 'a b', 'a/b', 'x'.repeat(101), 'ünïcode', 3]) expect(() => assertRepoName(n)).toThrow(/invalid repo name/);
  });
});

describe('commitPaths validation', () => {
  it('accepts a message and 1..100 relative paths, rebuilding a clean object', () => {
    const a = validateGitAction({ kind: 'commitPaths', message: 'x', paths: ['docs/a.md'], extra: 1 });
    expect(a).toEqual({ kind: 'commitPaths', message: 'x', paths: ['docs/a.md'] });
  });
  it('rejects empty, non-array, too many or malformed paths', () => {
    expect(() => validateGitAction({ kind: 'commitPaths', message: 'x', paths: [] })).toThrow(/invalid paths/);
    expect(() => validateGitAction({ kind: 'commitPaths', message: 'x', paths: 'docs/a.md' })).toThrow(/invalid paths/);
    expect(() => validateGitAction({ kind: 'commitPaths', message: 'x', paths: ['../a'] })).toThrow(/invalid path/);
    expect(() => validateGitAction({ kind: 'commitPaths', message: 'x', paths: Array(101).fill('a') })).toThrow(/invalid paths/);
    expect(() => validateGitAction({ kind: 'commitPaths', message: ' ', paths: ['a'] })).toThrow(/invalid message/);
  });
});

describe('assertPatch / applyPatch / sync validation', () => {
  const PATCH = ['diff --git a/src/a.ts b/src/a.ts', 'index 1111111..2222222 100644', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1 +1 @@', '-a', '+b', ''].join('\n');
  it('accepts a well-formed single-file patch, including /dev/null sides', () => {
    expect(assertPatch(PATCH)).toBe(PATCH);
    const created = 'diff --git a/n.txt b/n.txt\nnew file mode 100644\n--- /dev/null\n+++ b/n.txt\n@@ -0,0 +1 @@\n+x\n';
    expect(assertPatch(created)).toBe(created);
  });
  it('rejects non-strings, oversized, NUL, wrong header and escaping paths', () => {
    expect(() => assertPatch(42)).toThrow(/invalid patch/);
    expect(() => assertPatch('')).toThrow(/invalid patch/);
    expect(() => assertPatch(PATCH + 'x'.repeat(MAX_PATCH))).toThrow(/invalid patch/);
    expect(() => assertPatch(PATCH.replace('-a', '-a\0'))).toThrow(/invalid patch/);
    expect(() => assertPatch('--- a/x\n+++ b/x\n')).toThrow(/invalid patch/);
    expect(() => assertPatch(PATCH.replace('+++ b/src/a.ts', '+++ b/../x'))).toThrow(/invalid path/);
    expect(() => assertPatch(PATCH.replace('--- a/src/a.ts', '--- C:/x'))).toThrow(/invalid patch/);
  });
  it('rebuilds applyPatch (reverse must be exactly true) and sync', () => {
    expect(validateGitAction({ kind: 'applyPatch', patch: PATCH, reverse: 'yes' })).toEqual({ kind: 'applyPatch', patch: PATCH, reverse: false });
    expect(validateGitAction({ kind: 'applyPatch', patch: PATCH, reverse: true })).toEqual({ kind: 'applyPatch', patch: PATCH, reverse: true });
    expect(() => validateGitAction({ kind: 'applyPatch', patch: 'nope', reverse: false })).toThrow(/invalid patch/);
    expect(validateGitAction({ kind: 'sync', extra: 1 })).toEqual({ kind: 'sync' });
  });
});
