import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, LIMITS, MODEL_OPTIONS, normalizeConfig, validatePatch } from './config-schema';
import type { AppConfig } from './types';

const base: AppConfig = { root: 'C:\\P', lastProject: null, recent: [], ...DEFAULT_SETTINGS };

describe('normalizeConfig', () => {
  it('fills defaults for a legacy config without settings', () => {
    expect(normalizeConfig({ root: 'D:\\W' }, base)).toEqual({ ...base, root: 'D:\\W' });
  });
  it('keeps valid values and falls back per field on bad ones', () => {
    const out = normalizeConfig({
      root: 'D:\\W', lastProject: 'D:\\W\\a', recent: ['D:\\W\\a', 3],
      implModel: 'fable', reviewModel: 'gpt', maxRetries: 11, termFontSize: 12, logHeight: '200', notifyOnIdle: false,
    }, base);
    expect(out).toEqual({
      root: 'D:\\W', lastProject: 'D:\\W\\a', recent: ['D:\\W\\a'],
      implModel: 'fable', reviewModel: 'fable', maxRetries: 3, termFontSize: 12, logHeight: 160, notifyOnIdle: false,
    });
  });
  it('returns base for non-objects', () => {
    expect(normalizeConfig(null, base)).toEqual(base);
    expect(normalizeConfig('x', base)).toEqual(base);
  });
  it('exposes the option list and limits', () => {
    expect(MODEL_OPTIONS).toEqual(['opus', 'fable', 'sonnet']);
    expect(LIMITS.maxRetries.default).toBe(3);
    expect(DEFAULT_SETTINGS).toEqual({ implModel: 'opus', reviewModel: 'fable', maxRetries: 3, termFontSize: 14, logHeight: 160, notifyOnIdle: true });
  });
});

describe('validatePatch', () => {
  it('accepts whitelisted fields in range and rebuilds a clean object', () => {
    expect(validatePatch({ implModel: 'sonnet', maxRetries: 5, termFontSize: 16, logHeight: 300, notifyOnIdle: false, root: 'X', extra: 1 }))
      .toEqual({ implModel: 'sonnet', maxRetries: 5, termFontSize: 16, logHeight: 300, notifyOnIdle: false });
    expect(validatePatch({})).toEqual({});
  });
  it('rejects wrong types and out-of-range values', () => {
    expect(() => validatePatch({ implModel: 'gpt' })).toThrow(/invalid implModel/);
    expect(() => validatePatch({ reviewModel: 1 })).toThrow(/invalid reviewModel/);
    expect(() => validatePatch({ maxRetries: 0 })).toThrow(/invalid maxRetries/);
    expect(() => validatePatch({ maxRetries: 2.5 })).toThrow(/invalid maxRetries/);
    expect(() => validatePatch({ termFontSize: 25 })).toThrow(/invalid termFontSize/);
    expect(() => validatePatch({ logHeight: 59 })).toThrow(/invalid logHeight/);
    expect(() => validatePatch({ notifyOnIdle: 'yes' })).toThrow(/invalid notifyOnIdle/);
    expect(() => validatePatch(null)).toThrow(/invalid patch/);
  });
});
