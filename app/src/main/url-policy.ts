/**
 * 外部連結與「用系統開啟」的白／黑名單。
 * 抽成純函式，主行程與 IPC 都用同一份判斷，也方便單獨測試。
 */

/** 只有 http(s) 與 mailto 可以交給系統瀏覽器；長度上限避免塞爆命令列。 */
export function isExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) return false;
  return /^(https?|mailto):/i.test(url);
}

/** 可執行（或會被 Windows 當成腳本執行）的副檔名，一律不交給 shell.openPath。 */
export const BLOCKED_OPEN_EXT_RE = /\.(exe|bat|cmd|com|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|scr|reg|lnk|hta|cpl)$/i;
