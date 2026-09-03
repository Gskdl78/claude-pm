import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configPath, defaultConfig, loadConfig, saveConfig, rememberProject } from './config';
import { DEFAULT_SETTINGS } from '../shared/config-schema';

const tmp = () => mkdtempSync(join(tmpdir(), 'pm-cfg-'));

describe('config', () => {
  it('configPath is under ~/.claude-pm', () => {
    expect(configPath('C:\\Users\\x')).toBe(join('C:\\Users\\x', '.claude-pm', 'config.json'));
  });

  it('loadConfig returns default when missing or corrupt', () => {
    const file = join(tmp(), 'config.json');
    expect(loadConfig(file)).toEqual(defaultConfig());
    writeFileSync(file, '{oops');
    expect(loadConfig(file)).toEqual(defaultConfig());
  });

  it('loadConfig fills missing fields', () => {
    const file = join(tmp(), 'config.json');
    writeFileSync(file, JSON.stringify({ root: 'D:\\Work' }));
    expect(loadConfig(file)).toEqual({ root: 'D:\\Work', lastProject: null, recent: [], ...DEFAULT_SETTINGS });
  });

  it('loadConfig keeps settings fields and drops bad ones', () => {
    const file = join(tmp(), 'config.json');
    writeFileSync(file, JSON.stringify({ root: 'D:\\Work', implModel: 'sonnet', termFontSize: 99 }));
    const cfg = loadConfig(file);
    expect(cfg.implModel).toBe('sonnet');
    expect(cfg.termFontSize).toBe(14);
  });

  it('saveConfig creates directory and round-trips', () => {
    const file = join(tmp(), 'nested', 'config.json');
    const cfg = { root: 'D:\\Work', lastProject: 'D:\\Work\\a', recent: ['D:\\Work\\a'], ...DEFAULT_SETTINGS };
    saveConfig(cfg, file);
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(cfg);
    expect(loadConfig(file)).toEqual(cfg);
  });

  it('rememberProject sets lastProject and keeps recent unique, newest first, max 10', () => {
    let cfg = defaultConfig();
    for (let i = 0; i < 12; i++) cfg = rememberProject(cfg, `p${i}`);
    cfg = rememberProject(cfg, 'p5');
    expect(cfg.lastProject).toBe('p5');
    expect(cfg.recent[0]).toBe('p5');
    expect(cfg.recent).toHaveLength(10);
    expect(new Set(cfg.recent).size).toBe(10);
  });

  it('defaultConfig root ends with Projects', () => {
    expect(defaultConfig().root.endsWith('Projects')).toBe(true);
  });
});
