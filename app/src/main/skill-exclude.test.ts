import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addExclude, excludeLine, excludePath, hasExclude, removeExclude } from './skill-exclude';

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pm-skill-ex-'));
  mkdirSync(join(dir, '.git', 'info'), { recursive: true });
  return dir;
}

describe('exclude lines', () => {
  it('adds the line, creating the file when it does not exist', () => {
    const dir = repo();
    expect(hasExclude(dir, 'foo')).toBe(false);
    addExclude(dir, 'foo');
    expect(readFileSync(excludePath(dir), 'utf8')).toContain(excludeLine('foo'));
    expect(hasExclude(dir, 'foo')).toBe(true);
  });

  it('does not add the same line twice', () => {
    const dir = repo();
    addExclude(dir, 'foo');
    addExclude(dir, 'foo');
    const body = readFileSync(excludePath(dir), 'utf8');
    expect(body.split('\n').filter((l) => l === excludeLine('foo'))).toHaveLength(1);
  });

  it('removes only its own line and keeps the rest', () => {
    const dir = repo();
    writeFileSync(excludePath(dir), '# git ls-files --others\nbuild/\n');
    addExclude(dir, 'foo');
    removeExclude(dir, 'foo');
    expect(readFileSync(excludePath(dir), 'utf8')).toBe('# git ls-files --others\nbuild/\n');
    expect(hasExclude(dir, 'foo')).toBe(false);
  });

  it('is a no-op on a project without .git', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-skill-nogit-'));
    expect(hasExclude(dir, 'foo')).toBe(false);
    expect(() => addExclude(dir, 'foo')).not.toThrow();
    expect(() => removeExclude(dir, 'foo')).not.toThrow();
    expect(hasExclude(dir, 'foo')).toBe(false);
  });
});
