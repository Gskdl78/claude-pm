import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listDocs, readDoc, writeDoc, docsSignature, MAX_DOC_BYTES } from './docs';

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'pm-docs-'));
  mkdirSync(join(dir, 'docs', 'product', 'demo'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'verify'));
  writeFileSync(join(dir, 'docs', 'product', 'prd.md'), '# PRD\n');
  writeFileSync(join(dir, 'docs', 'verify', 'checklist.md'), '- [ ] a\r\n- [x] b\r\n');
  writeFileSync(join(dir, 'docs', 'product', 'demo', 'index.html'), '<html>');
  writeFileSync(join(dir, 'docs', 'notes.txt'), 'x');
  writeFileSync(join(dir, 'README.md'), '# root');
  return dir;
}

describe('listDocs', () => {
  it('lists only markdown files under docs/, sorted, with forward slashes', () => {
    const dir = project();
    expect(listDocs(dir).map((d) => d.rel)).toEqual(['docs/product/prd.md', 'docs/verify/checklist.md']);
    const prd = listDocs(dir)[0]!;
    expect(prd.size).toBe(6);
    expect(prd.mtimeMs).toBeGreaterThan(0);
  });
  it('returns [] when docs/ does not exist', () => {
    expect(listDocs(mkdtempSync(join(tmpdir(), 'pm-docs-empty-')))).toEqual([]);
  });
});

describe('readDoc / writeDoc', () => {
  it('reads utf8 content preserving line endings', () => {
    const dir = project();
    expect(readDoc(dir, 'docs/verify/checklist.md')).toBe('- [ ] a\r\n- [x] b\r\n');
  });
  it('writes atomically and leaves no tmp file', () => {
    const dir = project();
    writeDoc(dir, 'docs/verify/checklist.md', '- [x] a\r\n- [x] b\r\n');
    expect(readFileSync(join(dir, 'docs', 'verify', 'checklist.md'), 'utf8')).toBe('- [x] a\r\n- [x] b\r\n');
    expect(readdirSync(join(dir, 'docs', 'verify'))).toEqual(['checklist.md']);
  });
  it('removes the tmp file and keeps the original when the rename fails', () => {
    const dir = project();
    const fail = () => { throw new Error('EPERM'); };
    expect(() => writeDoc(dir, 'docs/product/prd.md', '# PRD v2\n', { writeFileSync, renameSync: fail, unlinkSync }))
      .toThrow(/EPERM/);
    expect(readdirSync(join(dir, 'docs', 'product'))).toEqual(['demo', 'prd.md']);
    expect(readFileSync(join(dir, 'docs', 'product', 'prd.md'), 'utf8')).toBe('# PRD\n');
  });
  it('rejects paths outside docs, non-markdown, traversal and missing files', () => {
    const dir = project();
    expect(() => readDoc(dir, 'README.md')).toThrow(/invalid doc path/);
    expect(() => readDoc(dir, 'docs/notes.txt')).toThrow(/invalid doc path/);
    expect(() => readDoc(dir, 'docs/../README.md')).toThrow(/invalid doc path/);
    expect(() => readDoc(dir, 'docs\\product\\prd.md')).toThrow(/invalid doc path/);
    expect(() => readDoc(dir, 'docs/missing.md')).toThrow();
    expect(() => writeDoc(dir, 'docs/new.md', 'x')).toThrow(/doc not found/);
    expect(existsSync(join(dir, 'docs', 'new.md'))).toBe(false);
  });
  it('rejects oversized files and content', () => {
    const dir = project();
    writeFileSync(join(dir, 'docs', 'big.md'), Buffer.alloc(MAX_DOC_BYTES + 1, 97));
    expect(() => readDoc(dir, 'docs/big.md')).toThrow(/doc too large/);
    expect(() => writeDoc(dir, 'docs/product/prd.md', 'a'.repeat(MAX_DOC_BYTES + 1))).toThrow(/doc too large/);
    expect(readDoc(dir, 'docs/product/prd.md')).toBe('# PRD\n');
  });
});

describe('docsSignature', () => {
  it('changes when a doc is modified, added or removed', () => {
    const dir = project();
    const s1 = docsSignature(dir);
    writeFileSync(join(dir, 'docs', 'product', 'prd.md'), '# PRD v2\n');
    const s2 = docsSignature(dir);
    expect(s2).not.toBe(s1);
    writeFileSync(join(dir, 'docs', 'tech.md'), '#');
    expect(docsSignature(dir)).not.toBe(s2);
  });
});
