import { describe, it, expect } from 'vitest';
import { splitHunks, buildHunkPatch } from './diff-hunks';

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
    expect(splitHunks('diff --git a/x b/x\n@@ -1 +1 @@\n-a\n+b\n…（已截斷）').truncated).toBe(true);
    expect(splitHunks('')).toEqual({ fileHeader: [], hunks: [], binary: false, truncated: false });
  });
});

describe('buildHunkPatch', () => {
  it('emits the header plus exactly one hunk, newline-terminated', () => {
    const p = splitHunks(DIFF);
    expect(buildHunkPatch(p, 1)).toBe(['diff --git a/src/a.ts b/src/a.ts', 'index 1111111..2222222 100644', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -10,2 +11,2 @@ function x() {', '-old', '+new', ' tail'].join('\n') + '\n');
    expect(() => buildHunkPatch(p, 5)).toThrow(/hunk/);
  });
});
