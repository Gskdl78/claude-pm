import type { DocEntry } from '../../../../shared/types';

interface Props {
  entries: DocEntry[];
  /** state.stages[stage].docs；可能含反斜線或非 md，元件內過濾 */
  stageDocs: string[];
  selected: string | null;
  onSelect: (rel: string) => void;
}

const GROUP_LABELS: Record<string, string> = { product: '產品', tech: '技術', build: '實作', verify: '驗證' };

function groupOf(rel: string): string {
  const parts = rel.split('/');
  return parts.length > 2 ? parts[1]! : '其他';
}

function label(rel: string): string { return rel.replace(/^docs\//, ''); }

export function DocList({ entries, stageDocs, selected, onSelect }: Props) {
  if (entries.length === 0) return <div className="doc-list"><div className="muted">此專案尚無文件</div></div>;
  const known = new Set(entries.map((e) => e.rel));
  const stage = stageDocs.map((d) => d.replace(/\\/g, '/')).filter((d) => known.has(d));
  const groups = new Map<string, DocEntry[]>();
  for (const e of entries) {
    const g = groupOf(e.rel);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(e);
  }
  const item = (rel: string, key: string) => (
    <button key={key} className={`doc-item${rel === selected ? ' active' : ''}`} title={rel} onClick={() => onSelect(rel)}>{label(rel)}</button>
  );
  return (
    <div className="doc-list">
      <div role="group" aria-label="目前階段" className="doc-group">
        <div className="doc-group-title">目前階段</div>
        {stage.length === 0 && <div className="muted">目前階段尚無文件</div>}
        {stage.map((rel) => item(rel, `stage:${rel}`))}
      </div>
      <div role="group" aria-label="全部文件" className="doc-group">
        <div className="doc-group-title">全部文件</div>
        {Array.from(groups.entries()).map(([g, list]) => (
          <div key={g} className="doc-folder">
            <div className="doc-folder-title">{GROUP_LABELS[g] ?? g}</div>
            {list.map((e) => item(e.rel, `all:${e.rel}`))}
          </div>
        ))}
      </div>
    </div>
  );
}
