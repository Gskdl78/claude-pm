import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 對話框開著時 Tab / Shift+Tab 只在容器內循環；開啟時若焦點在外面就聚焦第一個可聚焦元素
 * （元件自己有 autoFocus 的話會先拿到焦點，這裡就不動）。
 * 監聽掛在 document 上：點過遮罩之後焦點會落在 <body>，掛在容器上就收不到 Tab，焦點會逃到面板後面。
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return undefined;
    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!el.contains(document.activeElement)) focusables()[0]?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      const focused = document.activeElement;
      // 焦點已經在容器外（例如點了遮罩）：Tab 拉回第一個、Shift+Tab 拉回最後一個
      if (!el.contains(focused)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && focused === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && focused === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [ref, active]);
}
