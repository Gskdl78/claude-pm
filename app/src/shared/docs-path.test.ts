import { describe, it, expect } from 'vitest';
import { isDocRelPath, resolveDocLink, resolveRelPath } from './docs-path';

describe('isDocRelPath', () => {
  it('accepts docs/**/*.md with forward slashes', () => {
    expect(isDocRelPath('docs/product/prd.md')).toBe(true);
    expect(isDocRelPath('docs/a.MD')).toBe(true);
    expect(isDocRelPath('docs/x/y/z/中文.md')).toBe(true);
  });
  it('rejects everything else', () => {
    for (const bad of [
      '', 'docs', 'docs/', 'docs/a.txt', 'docs/a.md/', 'README.md', 'src/docs/a.md',
      'docs\\a.md', '/docs/a.md', 'C:/docs/a.md', 'docs/../a.md', 'docs/./a.md', 'docs//a.md',
      'docs/a.md\0', 42, null, undefined, 'docs/' + 'x'.repeat(5000) + '.md',
    ]) expect(isDocRelPath(bad), String(bad)).toBe(false);
  });
});

describe('resolveRelPath', () => {
  it('resolves relative hrefs against the source file directory', () => {
    expect(resolveRelPath('docs/product/prd.md', '../tech/tasks.md')).toBe('docs/tech/tasks.md');
    expect(resolveRelPath('docs/product/prd.md', 'demo/index.html')).toBe('docs/product/demo/index.html');
    expect(resolveRelPath('docs/product/prd.md', './prd.md#sec?x=1')).toBe('docs/product/prd.md');
    expect(resolveRelPath('docs/a.md', '/docs/b.md')).toBe('docs/b.md');
  });
  it('returns null for external urls, anchors, protocol-relative and escapes above the repo', () => {
    expect(resolveRelPath('docs/a.md', 'https://x.y/z.md')).toBeNull();
    expect(resolveRelPath('docs/a.md', 'mailto:a@b.c')).toBeNull();
    expect(resolveRelPath('docs/a.md', '#top')).toBeNull();
    expect(resolveRelPath('docs/a.md', '//cdn/x.md')).toBeNull();
    expect(resolveRelPath('docs/a.md', '../../etc/passwd')).toBeNull();
    expect(resolveRelPath('docs/a.md', '')).toBeNull();
    expect(resolveRelPath('docs/a.md', 'javascript:alert(1)')).toBeNull();
  });
});

describe('resolveDocLink', () => {
  it('only returns markdown files under docs/', () => {
    expect(resolveDocLink('docs/product/prd.md', '../tech/tasks.md')).toBe('docs/tech/tasks.md');
    expect(resolveDocLink('docs/product/prd.md', 'demo/index.html')).toBeNull();
    expect(resolveDocLink('docs/product/prd.md', '../../README.md')).toBeNull();
  });
});
