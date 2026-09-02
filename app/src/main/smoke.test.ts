import { describe, it, expect } from 'vitest';
import { STAGE_NAMES } from '../shared/types';

describe('shared types', () => {
  it('has five stages in order', () => {
    expect(STAGE_NAMES).toEqual(['env', 'design', 'tech', 'build', 'verify']);
  });
});
