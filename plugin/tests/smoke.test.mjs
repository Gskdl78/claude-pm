import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { makeTempDir } from './helpers.mjs';

describe('test environment', () => {
  it('creates a temp dir', () => {
    const dir = makeTempDir();
    expect(existsSync(dir)).toBe(true);
  });
});
