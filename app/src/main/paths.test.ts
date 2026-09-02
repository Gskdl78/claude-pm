import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { assertInsideRoot } from './paths';

describe('assertInsideRoot', () => {
  const root = resolve('C:\\Projects');

  it('accepts root itself and children', () => {
    expect(assertInsideRoot(root, root)).toBe(root);
    expect(assertInsideRoot(root, join(root, 'a'))).toBe(join(root, 'a'));
    expect(assertInsideRoot(root, join(root, 'a', 'docs', 'x.md'))).toBe(join(root, 'a', 'docs', 'x.md'));
  });

  it('is case-insensitive on win32', () => {
    if (process.platform !== 'win32') return;
    expect(assertInsideRoot(root, 'c:\\projects\\A')).toBe(resolve('c:\\projects\\A'));
  });

  it('rejects traversal, siblings and prefix look-alikes', () => {
    expect(() => assertInsideRoot(root, join(root, '..', 'Other'))).toThrow(/path outside root/);
    expect(() => assertInsideRoot(root, 'C:\\Projects2\\a')).toThrow(/path outside root/);
    expect(() => assertInsideRoot(root, 'D:\\x')).toThrow(/path outside root/);
  });
});
