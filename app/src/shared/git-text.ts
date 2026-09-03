/** diff / 提交內容送給 renderer 的長度上限；超過就截斷並附上 TRUNCATED。 */
export const MAX_TEXT = 512 * 1024;
/** 截斷時附加在尾端的標記。放在 shared 是為了讓 diff-hunks 用 endsWith 精確判斷，而不是比對內容裡的字串。 */
export const TRUNCATED = '\n…（內容過長，已截斷）';

/** 超過 MAX_TEXT 就切掉後面並接上 TRUNCATED；未截斷時原字串不變。 */
export function clip(text: string): string {
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) + TRUNCATED : text;
}
