import { useEffect, useRef, useState } from 'react';
import { STAGE_NAMES, STAGE_LABELS, type ProjectInfo, type StageInfo, type StageName, type StageStatus } from '../../../shared/types';

interface Props {
  project: ProjectInfo | null;
  /** pty 執行中且閒置時為 true；否則階段按鈕停用 */
  canRun: boolean;
  /** App 每次偵測到階段切換就 +1，面板據此閃爍 FLASH_MS */
  flashSeq: number;
  onRebuild: () => void;
  onOpenDoc: (relPath: string) => void;
  onRunStage: (stage: StageName) => void;
}

export const STAGE_ACTION_LABELS: Record<StageStatus, string> = {
  pending: '開始', in_progress: '繼續', blocked: '重跑', done: '',
};

export const FLASH_MS = 1500;

function doneTitle(info: StageInfo): string {
  if (!info.commit) return '';
  const when = info.at ? new Date(info.at) : null;
  const time = when && !Number.isNaN(when.getTime()) ? when.toLocaleString('zh-TW') : info.at;
  return time ? `commit ${info.commit} · ${time}` : `commit ${info.commit}`;
}

/** flashSeq 改變 → 加 flash class，FLASH_MS 後移除；unmount 時清掉計時器。 */
function useFlash(seq: number): boolean {
  const [on, setOn] = useState(false);
  const seen = useRef(seq);
  useEffect(() => {
    if (seen.current === seq) return;
    seen.current = seq;
    setOn(true);
    const t = setTimeout(() => setOn(false), FLASH_MS);
    return () => clearTimeout(t);
  }, [seq]);
  return on;
}

export function StagePanel({ project, canRun, flashSeq, onRebuild, onOpenDoc, onRunStage }: Props) {
  const flashing = useFlash(flashSeq);
  if (!project) return <div className="muted">選擇或建立一個專案</div>;
  if (!project.state) {
    return (
      <div className="stage-broken">
        <span className="error">狀態未知{project.stateError ? `：${project.stateError}` : ''}</span>{' '}
        <button onClick={onRebuild}>重建 state</button>
      </div>
    );
  }
  const s = project.state;
  const current: StageName | null = s.stage === 'done' ? null : s.stage;
  const docs = current ? s.stages[current].docs ?? [] : [];
  return (
    <div className="stage-body">
      <div className={`stages${flashing ? ' flash' : ''}`}>
        {STAGE_NAMES.map((st) => {
          const info = s.stages[st];
          // 已完成的階段沒有動作可送（狀態異常時 stage 仍可能指向它），一律當成純標籤
          const actionable = st === current && info.status !== 'done';
          if (!actionable) {
            return (
              <span key={st} className={`chip ${info.status}`} title={info.status === 'done' ? doneTitle(info) : info.reason ?? ''}>
                {STAGE_LABELS[st]}
              </span>
            );
          }
          return (
            <span key={st} className="chip-current">
              <button
                className={`chip ${info.status} current`}
                disabled={!canRun}
                title={canRun ? `送出 /stage-${st}` : 'Claude Code 執行中，請稍候'}
                onClick={() => onRunStage(st)}
              >
                {STAGE_LABELS[st]}
                <span className="action">{STAGE_ACTION_LABELS[info.status]}</span>
              </button>
              {info.status === 'blocked' && info.reason && <span className="reason">{info.reason}</span>}
            </span>
          );
        })}
        <span className="muted meta">
          {project.name} · {s.type} · issue：{s.issues.length}
          {s.stage === 'done' ? ' · 已完成' : ''}
        </span>
      </div>
      <div className="docs">
        {docs.length === 0 && <span className="muted">目前階段尚無文件</span>}
        {docs.map((d) => <button key={d} className="doc" onClick={() => onOpenDoc(d)}>{d}</button>)}
      </div>
    </div>
  );
}
