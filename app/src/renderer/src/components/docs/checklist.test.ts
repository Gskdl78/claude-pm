import { describe, it, expect } from 'vitest';
import { parseChecklist, toggleChecklistLine } from './checklist';

const doc = '# 人工驗證清單\n啟動方式：npm run dev\n\n## 流程 1\n- [ ] 步驟 1 → 預期：ok\n- [x] 步驟 2\n* [X] 星號也算\n  - [ ] 縮排\n非清單文字\n';

describe('parseChecklist', () => {
  it('classifies headings, tasks and text with 0-based line numbers, skipping blank lines', () => {
    expect(parseChecklist(doc)).toEqual([
      { kind: 'heading', level: 1, text: '人工驗證清單', line: 0 },
      { kind: 'text', text: '啟動方式：npm run dev', line: 1 },
      { kind: 'heading', level: 2, text: '流程 1', line: 3 },
      { kind: 'task', checked: false, text: '步驟 1 → 預期：ok', line: 4 },
      { kind: 'task', checked: true, text: '步驟 2', line: 5 },
      { kind: 'task', checked: true, text: '星號也算', line: 6 },
      { kind: 'task', checked: false, text: '縮排', line: 7 },
      { kind: 'text', text: '非清單文字', line: 8 },
    ]);
  });
});

describe('toggleChecklistLine', () => {
  it('flips only the target line and preserves everything else', () => {
    const out = toggleChecklistLine(doc, 4);
    expect(out.split('\n')[4]).toBe('- [x] 步驟 1 → 預期：ok');
    expect(out.replace('- [x] 步驟 1', '- [ ] 步驟 1')).toBe(doc);
    expect(toggleChecklistLine(doc, 5).split('\n')[5]).toBe('- [ ] 步驟 2');
    expect(toggleChecklistLine(doc, 7).split('\n')[7]).toBe('  - [x] 縮排');
  });
  it('preserves CRLF line endings', () => {
    const crlf = '- [ ] a\r\n- [ ] b\r\n';
    expect(toggleChecklistLine(crlf, 1)).toBe('- [ ] a\r\n- [x] b\r\n');
  });
  it('throws for non-task lines and out-of-range', () => {
    expect(() => toggleChecklistLine(doc, 0)).toThrow(/not a task line/);
    expect(() => toggleChecklistLine(doc, 99)).toThrow(/out of range/);
  });
});
