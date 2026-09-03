import { describe, it, expect } from 'vitest';
import { isExternalUrl, BLOCKED_OPEN_EXT_RE } from './url-policy';

describe('isExternalUrl', () => {
  it('accepts http(s) and mailto regardless of case', () => {
    expect(isExternalUrl('https://example.com/x')).toBe(true);
    expect(isExternalUrl('http://example.com')).toBe(true);
    expect(isExternalUrl('HTTPS://EXAMPLE.COM')).toBe(true);
    expect(isExternalUrl('mailto:a@b.c')).toBe(true);
    expect(isExternalUrl('MailTo:a@b.c')).toBe(true);
  });
  it('rejects other schemes, non-strings and oversized urls', () => {
    for (const bad of [
      'file:///C:/x', 'javascript:alert(1)', 'ftp://x', 'data:text/html,x', 'vbscript:x',
      '/docs/a.md', '', ' https://x', 42, null, undefined, {}, 'https://' + 'a'.repeat(3000),
    ]) expect(isExternalUrl(bad), String(bad)).toBe(false);
  });
});

describe('BLOCKED_OPEN_EXT_RE', () => {
  it('matches executable-ish extensions', () => {
    for (const p of ['setup.bat', 'C:\\x\\a.EXE', 'docs/x.ps1', 'a.cmd', 'a.lnk', 'a.msi', 'a.js', 'a.hta', 'a.reg'])
      expect(BLOCKED_OPEN_EXT_RE.test(p), p).toBe(true);
  });
  it('does not match documents', () => {
    for (const p of ['docs/a.md', 'demo/index.html', 'a.pdf', 'a.png', 'a.txt', 'a.json', 'a.batch', 'a.exe.md'])
      expect(BLOCKED_OPEN_EXT_RE.test(p), p).toBe(false);
  });
});
