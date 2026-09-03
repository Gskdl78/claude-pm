import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

/** 輸出區的預設高度，等於改為可調整之前的 CSS max-height。 */
export const DEFAULT_LOG_HEIGHT = 160;
export const LOG_HEIGHT_KEY = 'pm.gitLog.height';
const MIN_HEIGHT = 60;
/** 最多佔面板的 60%，避免把分頁內容擠光。 */
const MAX_RATIO = 0.6;
const STEP = 16;

function clamp(height: number, panelHeight: number): number {
  const max = Math.max(MIN_HEIGHT, panelHeight * MAX_RATIO);
  return Math.round(Math.min(max, Math.max(MIN_HEIGHT, height)));
}

/** localStorage 在部分環境（隱私模式、被停用）會丟例外，一律吞掉回到預設值。 */
function readHeight(): number {
  try {
    const raw = window.localStorage.getItem(LOG_HEIGHT_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= MIN_HEIGHT ? n : DEFAULT_LOG_HEIGHT;
  } catch {
    return DEFAULT_LOG_HEIGHT;
  }
}

/** 輸出區高度 + 寫回 localStorage。 */
export function useLogHeight(): [number, (height: number) => void] {
  const [height, setHeight] = useState(readHeight);
  useEffect(() => {
    try { window.localStorage.setItem(LOG_HEIGHT_KEY, String(height)); } catch { /* 存不進去就算了 */ }
  }, [height]);
  return [height, setHeight];
}

interface Props {
  height: number;
  onHeight: (height: number) => void;
  label?: string;
}

/** 輸出區上方的水平拖曳橫桿：往上拖放大輸出區，往下拖縮小。 */
export function ResizeHandle({ height, onHeight, label = '調整輸出區高度' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y: number; height: number } | null>(null);

  // 面板高度用來算上限；jsdom 或尚未佈局時退回視窗高度
  const panelHeight = useCallback(() => {
    const rect = ref.current?.parentElement?.getBoundingClientRect();
    return rect && rect.height > 0 ? rect.height : window.innerHeight;
  }, []);

  const apply = useCallback((next: number) => { onHeight(clamp(next, panelHeight())); }, [onHeight, panelHeight]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, y: e.clientY, height };
    // 指標離開橫桿後仍要繼續收到事件；jsdom 沒有這個 API
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* 不支援就用一般冒泡 */ }
    e.preventDefault();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    apply(d.height + (d.y - e.clientY));
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    try { e.currentTarget.releasePointerCapture?.(drag.current.id); } catch { /* 同上 */ }
    drag.current = null;
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); apply(height + STEP); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); apply(height - STEP); }
  };

  return (
    <div
      ref={ref}
      className="git-resize"
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuenow={height}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => apply(DEFAULT_LOG_HEIGHT)}
      onKeyDown={onKeyDown}
    />
  );
}
