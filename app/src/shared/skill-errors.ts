/** 主程序丟出的訊息 → 給使用者看的白話說明；對不到就回 null（UI 顯示原文）。 */
const TABLE: readonly (readonly [string, string])[] = [
  ['invalid skill source', '看不懂這個來源。請貼 https:// 或 git@ 的 git 網址、GitHub 的資料夾（tree）網址，或一個本機資料夾的絕對路徑。'],
  ['skill too large', '這個來源超過上限（200 個檔案 / 總共 2 MB / 單檔 512 KB），為了安全不匯入。'],
  ['no skill found', '在這個來源裡找不到 SKILL.md（只會往下找兩層資料夾）。'],
  ['invalid frontmatter', 'SKILL.md 開頭沒有合法的 frontmatter，或缺少 name 欄位。'],
  ['skill name exists', '同名的 skill 已經存在，請換一個名字再安裝。'],
  ['invalid skill name', 'skill 名稱只能用英數與 . _ -，開頭必須是英數，最長 64 個字。'],
  ['symlink in source', '來源裡有符號連結，可能指到來源資料夾外面，已擋下。'],
  ['unknown source', '這個來源已經失效，請重新取得一次。'],
  ['path outside root', '這個動作想寫到預期範圍外的路徑，已擋下。'],
  ['not a git repo', '這個專案還不是 git 專案，沒辦法採用（採用需要 commit）。'],
];

export function explainSkillError(message: string): string | null {
  const m = message.toLowerCase();
  for (const [key, text] of TABLE) if (m.includes(key)) return text;
  return null;
}
