import { describe, it, expect } from 'vitest';
import { parseSkillSource } from './skill-url';

describe('parseSkillSource', () => {
  it('takes a plain repo url', () => {
    expect(parseSkillSource('https://github.com/u/r')).toEqual({ kind: 'repo', url: 'https://github.com/u/r', ref: null, subpath: null });
    expect(parseSkillSource('https://github.com/u/r.git')).toEqual({ kind: 'repo', url: 'https://github.com/u/r.git', ref: null, subpath: null });
    expect(parseSkillSource('git@github.com:u/r.git')).toEqual({ kind: 'repo', url: 'git@github.com:u/r.git', ref: null, subpath: null });
  });

  it('splits a github tree url into url + ref + subpath', () => {
    expect(parseSkillSource('https://github.com/u/r/tree/main/skills/foo')).toEqual({
      kind: 'repo', url: 'https://github.com/u/r', ref: 'main', subpath: 'skills/foo',
    });
  });

  it('takes an absolute local path', () => {
    expect(parseSkillSource('C:\\x\\skills\\foo')).toEqual({ kind: 'local', path: 'C:\\x\\skills\\foo' });
    expect(parseSkillSource('/home/u/skills/foo')).toEqual({ kind: 'local', path: '/home/u/skills/foo' });
  });

  it('rejects everything else', () => {
    const bads = [
      '', 'javascript:alert(1)', 'http://github.com/u/r', 'github.com/u/r',
      '\\\\host\\share', '//host/share', 'skills/foo',
      'https://github.com/u/r/tree/main/../../etc', 'https://github.com/u/r/tree/main/a\0b',
    ];
    for (const bad of bads) {
      expect(() => parseSkillSource(bad), bad).toThrow(/invalid skill source/);
    }
    expect(() => parseSkillSource(`https://github.com/u/r/tree/main/${'a'.repeat(3000)}`)).toThrow(/invalid skill source/);
  });
});
