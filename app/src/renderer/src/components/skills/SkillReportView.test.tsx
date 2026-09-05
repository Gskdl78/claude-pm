import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { SkillReport } from '../../../../shared/types';
import { SkillReportView } from './SkillReportView';

const report: SkillReport = {
  name: 'foo', dirName: 'foo', nameMatchesDir: true, description: '做事',
  frontmatter: { name: 'foo', description: '做事' }, rel: '',
  files: [{ rel: 'SKILL.md', bytes: 10, lines: 2 }, { rel: 'run.sh', bytes: 20, lines: 3 }],
  totalBytes: 30, executables: ['run.sh'],
  findings: [{ pattern: 'curl', file: 'run.sh', line: 2 }],
  hosts: ['example.com'], collisions: [], skillMd: '---\nname: foo\n---\n',
};

const view = (over: Partial<ComponentProps<typeof SkillReportView>> = {}) =>
  render(<SkillReportView report={report} source="https://github.com/u/r" busy={false} canAnalyze
    onAnalyze={vi.fn()} onTrial={vi.fn()} onBack={vi.fn()} {...over} />);

describe('SkillReportView', () => {
  it('shows the facts and the standing warning', () => {
    view();
    expect(screen.getByRole('heading', { name: 'foo' })).toBeInTheDocument();
    expect(screen.getByText('檔案（2 個，共 30 位元組）')).toBeInTheDocument();
    // run.sh 同時出現在檔案清單、可執行檔與命中樣式三處
    expect(screen.getAllByText(/run\.sh/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/curl/)).toBeInTheDocument();
    expect(screen.getByText(/不是安全保證/)).toBeInTheDocument();
  });

  it('hands the built prompt to onAnalyze', () => {
    const onAnalyze = vi.fn();
    view({ onAnalyze });
    fireEvent.click(screen.getByRole('button', { name: '請 Claude Code 分析' }));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
    expect(onAnalyze.mock.calls[0]![0]).toContain('https://github.com/u/r');
  });

  it('disables analyze while the terminal is busy', () => {
    view({ canAnalyze: false });
    expect(screen.getByRole('button', { name: '請 Claude Code 分析' })).toBeDisabled();
  });

  it('warns when the frontmatter name does not match the folder', () => {
    view({ report: { ...report, nameMatchesDir: false, dirName: 'other' } });
    expect(screen.getByText(/資料夾名卻是 other/)).toBeInTheDocument();
  });

  it('warns about an existing same-name skill', () => {
    view({ report: { ...report, collisions: [{ scope: 'global', where: 'C:/u/.claude/skills/foo' }] } });
    expect(screen.getByText(/已經有同名的 skill/)).toBeInTheDocument();
  });
});
