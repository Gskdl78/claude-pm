import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copySkillTree } from './skill-copy';

const tmp = () => mkdtempSync(join(tmpdir(), 'pm-skill-copy-'));

describe('copySkillTree', () => {
  it('copies files and nested folders but skips .git', () => {
    const src = join(tmp(), 'foo');
    mkdirSync(join(src, 'scripts'), { recursive: true });
    mkdirSync(join(src, '.git'), { recursive: true });
    writeFileSync(join(src, 'SKILL.md'), '# skill');
    writeFileSync(join(src, 'scripts', 'run.mjs'), 'export default 1;');
    writeFileSync(join(src, '.git', 'HEAD'), 'ref: refs/heads/main');
    const dest = join(tmp(), 'out');
    copySkillTree(src, dest);
    expect(readFileSync(join(dest, 'SKILL.md'), 'utf8')).toBe('# skill');
    expect(existsSync(join(dest, 'scripts', 'run.mjs'))).toBe(true);
    expect(existsSync(join(dest, '.git'))).toBe(false);
  });

  it('refuses a source containing a symlink', () => {
    const src = join(tmp(), 'foo');
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, 'SKILL.md'), '# skill');
    try {
      symlinkSync(tmpdir(), join(src, 'link'), 'dir');
    } catch {
      return; // Windows 沒開開發者模式時建不了 symlink，跳過這條
    }
    expect(() => copySkillTree(src, join(tmp(), 'out'))).toThrow(/symlink in source/);
  });
});
