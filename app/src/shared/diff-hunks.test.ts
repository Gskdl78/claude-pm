import { describe, it, expect } from 'vitest';
import { splitHunks, buildHunkPatch } from './diff-hunks';
import { TRUNCATED } from './git-text';

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts', 'index 1111111..2222222 100644', '--- a/src/a.ts', '+++ b/src/a.ts',
  '@@ -1,3 +1,4 @@', ' line1', '+added1', ' line2', ' line3',
  '@@ -10,2 +11,2 @@ function x() {', '-old', '+new', ' tail',
].join('\n') + '\n';

describe('splitHunks', () => {
  it('separates the file header from hunks', () => {
    const p = splitHunks(DIFF);
    expect(p.fileHeader).toEqual(['diff --git a/src/a.ts b/src/a.ts', 'index 1111111..2222222 100644', '--- a/src/a.ts', '+++ b/src/a.ts']);
    expect(p.hunks.map((h) => h.header)).toEqual(['@@ -1,3 +1,4 @@', '@@ -10,2 +11,2 @@ function x() {']);
    expect(p.hunks[1]!.lines).toEqual(['-old', '+new', ' tail']);
    expect(p.binary).toBe(false); expect(p.truncated).toBe(false);
  });
  it('flags binary and truncated diffs and tolerates empty input', () => {
    expect(splitHunks('diff --git a/x b/x\nBinary files a/x and b/x differ\n').binary).toBe(true);
    expect(splitHunks(`diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b${TRUNCATED}`).truncated).toBe(true);
    expect(splitHunks('')).toEqual({ fileHeader: [], hunks: [], binary: false, truncated: false });
  });

  it('only treats the real clip marker at the end as truncation', () => {
    // 這個 App 自己的原始碼就含「已截斷」字樣；用 includes 判斷會把整份 diff 誤判成被截斷
    const mentions = DIFF.replace('+added1', `+const MARK = '${TRUNCATED.trim()}';`);
    expect(splitHunks(mentions).truncated).toBe(false);
    expect(splitHunks(mentions).hunks).toHaveLength(2);
  });

  it('stops at a second file so a hunk patch can never carry another file', () => {
    const two = DIFF + ['diff --git a/src/b.ts b/src/b.ts', 'index 3333333..4444444 100644', '--- a/src/b.ts', '+++ b/src/b.ts',
      '@@ -1 +1 @@', '-other', '+changed', ''].join('\n');
    const p = splitHunks(two);
    expect(p.fileHeader).toEqual(['diff --git a/src/a.ts b/src/a.ts', 'index 1111111..2222222 100644', '--- a/src/a.ts', '+++ b/src/a.ts']);
    expect(p.hunks).toHaveLength(2);
    expect(buildHunkPatch(p, 1)).not.toContain('src/b.ts');
  });
});

describe('buildHunkPatch', () => {
  it('emits the header plus exactly one hunk, newline-terminated', () => {
    const p = splitHunks(DIFF);
    expect(buildHunkPatch(p, 1)).toBe(['diff --git a/src/a.ts b/src/a.ts', 'index 1111111..2222222 100644', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -10,2 +11,2 @@ function x() {', '-old', '+new', ' tail'].join('\n') + '\n');
    expect(() => buildHunkPatch(p, 5)).toThrow(/hunk/);
  });
});
