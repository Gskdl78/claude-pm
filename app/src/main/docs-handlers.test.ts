import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDocsHandlers } from './docs-handlers';
import { assertInsideRoot } from './paths';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'pm-docs-h-'));
  const dir = join(root, 'demo');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'docs', 'a.md'), '# a\n');
  const h = createDocsHandlers((p) => assertInsideRoot(root, p));
  return { root, dir, h };
}

describe('docs handlers', () => {
  it('list / read / write go through the root guard', async () => {
    const { dir, h } = setup();
    expect((await h['docs:list'](dir)).map((d) => d.rel)).toEqual(['docs/a.md']);
    expect(await h['docs:read'](dir, 'docs/a.md')).toBe('# a\n');
    await h['docs:write'](dir, 'docs/a.md', '# b\n');
    expect(await h['docs:read'](dir, 'docs/a.md')).toBe('# b\n');
  });
  it('rejects projects outside root and bad rel / content', async () => {
    const { root, dir, h } = setup();
    await expect(h['docs:list'](join(root, '..', 'x'))).rejects.toThrow();
    await expect(h['docs:read'](dir, '../a.md')).rejects.toThrow(/invalid doc path/);
    await expect(h['docs:read'](dir, 42 as unknown as string)).rejects.toThrow(/invalid doc path/);
    await expect(h['docs:write'](dir, 'docs/a.md', 42 as unknown as string)).rejects.toThrow(/invalid content/);
  });
});
