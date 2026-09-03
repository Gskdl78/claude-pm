export const CHECKLIST_REL = 'docs/verify/checklist.md';
export const CHECKLIST_COMMIT_MESSAGE = 'docs(verify): 更新清單';

export type ChecklistLine =
  | { kind: 'heading'; level: number; text: string; line: number }
  | { kind: 'task'; checked: boolean; text: string; line: number }
  | { kind: 'text'; text: string; line: number };

// 群組 1：清單前綴（含縮排）；群組 2：勾選狀態；群組 3：其餘文字（含開頭空白）
const TASK_RE = /^(\s*[-*]\s+)\[( |x|X)\](\s.*|)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/** 逐行分類；空行略過。line 為 0-based，供 toggleChecklistLine 使用。 */
export function parseChecklist(text: string): ChecklistLine[] {
  return text.split(/\r?\n/).flatMap((raw, line): ChecklistLine[] => {
    const h = HEADING_RE.exec(raw);
    if (h) return [{ kind: 'heading', level: h[1]!.length, text: h[2]!.trim(), line }];
    const t = TASK_RE.exec(raw);
    if (t) return [{ kind: 'task', checked: t[2] !== ' ', text: t[3]!.trim(), line }];
    if (raw.trim() === '') return [];
    return [{ kind: 'text', text: raw, line }];
  });
}

/** 只改目標行的 [ ] / [x]，其餘文字與換行原樣保留（整份以第一個換行樣式為準）。 */
export function toggleChecklistLine(text: string, line: number): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const raw = lines[line];
  if (raw === undefined) throw new Error('line out of range');
  const t = TASK_RE.exec(raw);
  if (!t) throw new Error('not a task line');
  lines[line] = `${t[1]}[${t[2] === ' ' ? 'x' : ' '}]${t[3]}`;
  return lines.join(eol);
}
