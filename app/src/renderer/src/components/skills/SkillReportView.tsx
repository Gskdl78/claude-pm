import type { SkillReport } from '../../../../shared/types';
import { buildAnalysisPrompt } from '../../../../shared/skill-prompt';

interface Props {
  report: SkillReport;
  source: string;
  busy: boolean;
  /** 終端機閒置時才能送分析提示 */
  canAnalyze: boolean;
  onAnalyze: (prompt: string) => void;
  onTrial: () => void;
  onBack: () => void;
}

export function SkillReportView({ report: r, source, busy, canAnalyze, onAnalyze, onTrial, onBack }: Props) {
  return (
    <div className="skill-report">
      <button className="link" onClick={onBack}>← 回清單</button>
      <h3>{r.name}</h3>
      <p className="muted">{r.description || '（沒有 description）'}</p>
      {!r.nameMatchesDir && (
        <p className="warn">frontmatter 的 name 是 {r.name}，資料夾名卻是 {r.dirName}；Claude Code 認的是 name。</p>
      )}

      <h4>檔案（{r.files.length} 個，共 {r.totalBytes} 位元組）</h4>
      <ul className="skill-files">
        {r.files.map((f) => (
          <li key={f.rel}>{f.rel}<span className="muted"> — {f.bytes} 位元組 / {f.lines} 行</span></li>
        ))}
      </ul>

      <h4>可執行檔</h4>
      <p>{r.executables.length ? r.executables.join('、') : '（無）'}</p>

      <h4>值得看一眼的樣式</h4>
      {r.findings.length === 0 ? <p>（無）</p> : (
        <ul className="skill-findings">
          {r.findings.map((f, i) => (
            <li key={`${f.file}:${f.line}:${f.pattern}:${i}`}>{f.pattern}<span className="muted"> — {f.file}:{f.line}</span></li>
          ))}
        </ul>
      )}

      <h4>連外網域</h4>
      <p>{r.hosts.length ? r.hosts.join('、') : '（無）'}</p>

      {r.collisions.length > 0 && (
        <p className="warn">已經有同名的 skill：{r.collisions.map((c) => c.where).join('、')}</p>
      )}

      <p className="skill-caveat">
        靜態掃描是風險提示，不是安全保證；skill 附帶的 script 一旦被執行就是任意程式碼。
      </p>

      <div className="row">
        <button disabled={busy || !canAnalyze} title={canAnalyze ? '' : 'Claude Code 執行中，請稍候'}
          onClick={() => onAnalyze(buildAnalysisPrompt(source, r))}>請 Claude Code 分析</button>
        <button disabled={busy} onClick={onTrial}>試用</button>
      </div>
    </div>
  );
}
