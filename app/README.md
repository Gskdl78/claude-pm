# claude-pm 桌面程式

## 開發

```bash
cd app
npm install        # 不會自動 rebuild；node-pty 1.1.0 的 N-API prebuild 可直接在 Electron 44 載入
npm run dev        # 開發模式（熱重載）
npm test           # vitest（main + renderer）
npm run typecheck
```

## 打包

```bash
npm run dist       # 產出 dist/claude-pm Setup x.y.z.exe 與 portable exe
```

plugin 目錄會以 extraResources 一起打包到 `resources/plugin`，主程序用 `getPluginDir()` 取得。

## 設定

側欄上方的 ⚙ 開設定對話框：專案根目錄（可用資料夾選擇器）、預設實作模型 / 小任務模型 / 審核模型、審核退回上限、終端機字型大小、資訊框預設高度、Claude Code 等待輸入時是否閃爍並通知。儲存即生效並寫進 `%USERPROFILE%\.claude-pm\config.json`：

```json
{
  "root": "C:\\Projects", "lastProject": "C:\\Projects\\my-app", "recent": [],
  "implModel": "opus", "reviewModel": "fable", "smallModel": "sonnet", "maxRetries": 3,
  "termFontSize": 14, "logHeight": 160, "notifyOnIdle": true
}
```

- 模型與退回上限只影響之後「+ 新專案」或「初始化」產生的 CLAUDE.md（模型政策節），既有專案不動。
- 小任務模型是降級檔位：`/stage-build` 只在任務「模組」只有一個、「驗收」條目 ≤ 3 且不含重構 / 認證 / 權限 / 加密 / 遷移關鍵字時才用它，其餘仍用實作模型；審核一律用審核模型。
- 改根目錄會關閉目前專案（結束 Claude Code session）並重新載入清單。
- 資訊框高度：手動拖過的高度存在瀏覽器 localStorage，優先於設定的預設值。

### 手動驗證

1. ⚙ → 字型大小改 18 → 儲存：終端機立即變大且輸入正常。
2. 關閉「等待輸入時閃爍並通知」→ 視窗切到背景等 Claude Code 提問：不閃、不通知；側欄仍顯示「● 等待回覆」。
3. 實作模型改 sonnet、退回上限改 2 → 新建專案：其 CLAUDE.md 模型政策節顯示 `sonnet` 與「2 次」。
4. 根目錄改到另一個資料夾：專案清單換成該資料夾內容，原專案關閉。

## 新專案

側欄「+ 新專案」對話框有兩個分頁：

- 「建立空專案」：在根目錄下建立資料夾並以 plugin 的 scaffold 初始化（`.pm/state.json`、CLAUDE.md、階段 skills、第一個 commit）。
- 「從 URL 複製」：輸入 `https://` 或 `git@主機:帳號/倉庫(.git)` 網址，或本機資料夾的絕對路徑，主程序執行 `git clone -- <來源> <root>/<名稱>`。專案名稱會從網址最後一段自動帶入（去掉 `.git`），改過就不再覆寫；目標資料夾已存在會被拒絕。複製只做 git clone，**不會**自動初始化 pm，之後可在側欄按「初始化」。clone 失敗（找不到倉庫、需要登入、網路）會以白話顯示在對話框裡。

### 手動驗證

1. 「+ 新專案」→「從 URL 複製」→ 貼 `https://github.com/<你>/<倉庫>.git`：名稱自動變成 `<倉庫>`；按「複製」後側欄出現該專案並開啟，右欄 git 面板顯示其分支與歷史，側欄有「初始化」可按。
2. 來源填一個不存在的本機路徑或 `javascript:` 開頭的字串：按鈕仍可按，但對話框顯示「invalid clone source」類錯誤且不建立資料夾。

## Git 面板

右欄（360px）是內建的 git 面板：上方是分支狀態與「推送 / 拉取 / 擷取 / 同步」，中間是「變更 / 分支 / 歷史 / 進階」四個分頁，下方是輸出區。

- 每個會改變狀態的按鈕都先彈出確認框，顯示白話說明與將執行的確切 git 指令；會丟失工作的操作（丟棄、amend、hard reset、stash 丟棄、刪除標籤、中止合併）以紅色危險樣式呈現，焦點預設在「取消」。
- git 失敗時輸出區顯示繁體中文說明並附原始輸出；對映表在 `src/shared/git-errors.ts`。
- 面板在每次動作後、`.git` 有變化時（500ms 輪詢 `logs/HEAD`、`HEAD`、`index`、`MERGE_HEAD`、`refs/heads`、`FETCH_HEAD`、`packed-refs`、`refs/tags`、`refs/stash`）以及每 3 秒（視窗可見時）重讀狀態，所以終端機裡 Claude Code 的 git 操作與檔案編輯都會反映在面板。
- 「進階」分頁：收藏（`git stash push -u`，可附說明；清單可「取回」或「丟棄」）、重設（soft / mixed / hard 到 `HEAD~n` 或 hash；hard 為紅色危險確認）、標籤（建立於 HEAD 或指定提交、刪除、列表）。「歷史」分頁每筆 commit 有「還原 / 重設到此 / 標籤」；合併中的衝突橫幅有「中止合併」。
- 尚未設定遠端時按「推送 / 拉取」會開啟「發佈到 GitHub」精靈：偵測 GitHub CLI（`gh --version`、`gh auth status`）後可選「新建 GitHub 倉庫」（`gh repo create <名稱> --private|--public --source=. --remote=origin --push`）或「貼現有倉庫網址」（`git remote add origin <網址>` + `git push -u origin HEAD`；只接受 `https://` 或 `git@主機:帳號/倉庫`）。推送被拒時面板提示「先擷取」或「拉取（變基）」，不提供強制推送。
- `gh` 與 git 一樣在主程序以 `execFile` 執行，argv 只有三種白名單；倉庫名稱與網址都先驗證。
- 所有 git 都在主程序以 `execFile('git', argv)` 執行，路徑必須位於專案根目錄之內，檔案路徑、分支名、hash、訊息都經驗證後才組成 argv。
- 逐段暫存：在「變更」頁點檔名開 diff，未暫存檔案的每個 hunk 標頭右側有「暫存此段」，已暫存的有「取消暫存此段」；按下後 renderer 把該段組成單檔 patch，主程序以 `git apply --cached [-R] --whitespace=nowarn -`（patch 走 stdin）套進索引，不彈確認（與 `+` / `−` 同級），完成後重讀同一份 diff，沒剩就自動關閉。新檔案（untracked）、二進位檔與被截斷的超長 diff 不提供逐段操作。patch 在主程序驗證：≤ 1 MB、無 NUL、以 `diff --git a/` 開頭、`---` / `+++` 路徑只能是 `/dev/null` 或 repo 內相對路徑。
- commit 前綴：訊息框上方有一列前綴按鈕 `chore(env): docs(design): docs(tech): feat: fix: test: fix(security): fix(verify):`，目前階段對應的前綴高亮（env→`chore(env):`、design→`docs(design):`、tech→`docs(tech):`、build→`feat:`、verify→`fix(verify):`、done→`feat:`）。點任一前綴插入到訊息開頭；訊息已有某個候選前綴時改為替換，不會重複。
- 「同步」：與獨立版 git-panel 相同的一鍵流程 —— 目前分支沒有上游就直接 `git push -u origin HEAD`；有上游先 `git pull --rebase`，成功（或遠端還沒有這個分支）再 `git push -u origin HEAD`；pull 失敗（例如衝突）就停在那裡，輸出區顯示白話說明。沒有遠端時停用。
- 推送被拒的黃色提示列只在「推送 / 拉取 / 拉取（變基）/ 同步 / 發佈」成功後清除；「擷取」不會清（擷取不改變落後狀態）。
- 所有對話框（確認框、diff、發佈精靈、設定、session 上限、新專案）都有 focus trap：Tab / Shift+Tab 只在對話框內循環；發佈精靈開啟時第一個輸入框自動聚焦，Esc 關閉（執行中除外）。還原「合併提交」失敗時會提示需在終端機執行 `git revert -m 1 <hash>`。

### 手動驗收清單（批次一）

1. 開啟一個 App 建立的專案：右欄顯示 `● main`、「無遠端」pill、三個分頁；「變更」為空。
2. 在終端機讓 Claude Code 改一個檔案：3 秒內出現在「未暫存」；點檔名開 diff；按 `+` 立即進「已暫存」（無確認框）。
3. 輸入訊息按「提交」：確認框顯示 `git commit -m "…"`；確認後輸出區「完成 ✓」、訊息清空、「歷史」多一筆。
4. 對未暫存檔按 `✕`：紅色危險確認框、焦點在「取消」、按 Enter 不會執行；點「我了解風險，執行」後檔案還原。
5. 「分支」分頁新增 `feature/x`：確認後目前分支變成 feature/x；切回 main；合併 feature/x 成功。
6. 兩邊改同一行後合併：輸出區顯示衝突白話說明、面板出現紅色橫幅與「衝突」組；按 `✓` 標記後提交成功、橫幅消失。
7. 沒有遠端時按「推送」：不開確認框，輸出區顯示黃色提示；「擷取」停用。
8. 在終端機 `git remote add origin <本地 bare repo 路徑>` 後按「推送」：確認框顯示 `git push -u origin HEAD`；成功後「無遠端」pill 消失、`↑` 歸零。
9. 在 root 底下開一個非 git 資料夾（未初始化專案）：面板顯示「這個資料夾還不是 git 專案」；「初始化」確認後切換成完整面板。
10. 在終端機執行 `git switch -c y`：0.5 秒內狀態列變成 `● y`。

### 手動驗收清單（批次二）

1. 「進階」分頁：改一個檔案 → 輸入說明「暫時」→「收藏目前變更」：確認框顯示 `git stash push -u -m 暫時`；確認後「變更」清空、清單出現 `stash@{0}`；「取回」後變更回來、清單清空。
2. 「丟棄」一筆收藏：紅色危險確認、焦點在「取消」；執行後清單移除。
3. 建立標籤 `v1`：清單出現；在終端機執行 `git tag v2`：0.5 秒內清單出現 v2（需停在「進階」頁）；「刪除」v2。
4. 「歷史」→ 最新一筆「還原」：確認框 `git revert --no-edit <hash>`；確認後歷史多一筆 `Revert "…"`。
5. 「歷史」→ 某筆「重設到此」：自動切到「進階」、目標填入 hash；選 `hard` → 重設鈕變紅、確認框為危險樣式、按 Enter 不會執行；確認後歷史縮短、工作目錄回到該版本。選 `soft` 重設 `HEAD~1`：確認框為一般樣式，執行後上一筆的變更出現在「已暫存」。
6. 製造合併衝突：橫幅出現「中止合併」；確認 `git merge --abort` 後橫幅消失、檔案回復。
7. 沒有遠端時按「推送」：精靈顯示 gh 安裝 / 登入狀態；未安裝 gh 時「新建」停用並提示 `winget install GitHub.cli`。
8. 精靈「貼現有倉庫網址」：貼 `http://…` 顯示不合法；貼 `https://github.com/<你>/<空倉庫>.git` → 下一步 → 確認框兩行指令 → 執行後「無遠端」pill 消失、輸出區兩個「完成 ✓」。
9. 已安裝並登入 gh：精靈「新建」預設倉庫名 = 資料夾名、私人 → 確認框 `gh repo create … --private --source=. --remote=origin --push` → 執行後 GitHub 上出現倉庫、狀態列 `→ origin/main`。
10. 在 GitHub 網頁上對倉庫多加一個 commit，再按「推送」：輸出區白話「推送被拒」，狀態列下方出現黃色提示列，只有「先擷取」「拉取（變基）」，沒有任何強制推送；「拉取（變基）」確認 `git pull --rebase` 後再推送成功、提示列消失。

### 手動驗收清單（批次三：git 面板完整化）

1. 改同一個檔案相隔很遠的兩處 → 「變更」頁點檔名開 diff：兩個 hunk 各有「暫存此段」；按第二個 → 沒有確認框、輸出區 `> git apply --cached --whitespace=nowarn -` 與「完成 ✓」、diff 視窗只剩第一段、檔案同時出現在「已暫存」與「未暫存」。再開已暫存的 diff → 「取消暫存此段」→ 視窗自動關閉、檔案回到只在「未暫存」。
2. 新增一個檔案（untracked）與一個二進位檔，各開 diff：沒有逐段按鈕。
3. 專案在 design 階段：commit 訊息框上方 `docs(design):` 高亮；輸入「更新 PRD」後點 `docs(design):` → 訊息變 `docs(design): 更新 PRD`；再點 `fix:` → 變 `fix: 更新 PRD`（不重複）。
4. 有遠端且遠端多一個 commit、本地也多一個 commit：按「同步」→ 確認框標題「確認：同步」、指令 `git pull --rebase && git push -u origin HEAD` → 執行後 `↑ ↓` 都歸零、歷史含雙方 commit。沒有上游的新分支按「同步」→ 直接推送並建立追蹤。
5. 推送被拒出現黃色提示列後按「先擷取」：提示列仍在；再按「拉取（變基）」成功後提示列消失。
6. 開任一對話框連按 Tab：焦點只在對話框內循環；「發佈到 GitHub」精靈開啟時游標已在第一個輸入框，按 Esc 直接關閉。
7. 「歷史」對一筆合併提交按「還原」：輸出區顯示「這是合併提交…請在終端機執行 git revert -m 1 <hash>」。

## 階段按鈕與等待輸入通知

- 上方階段列只有**目前階段**是按鈕：pending 顯示「開始」、in_progress 顯示「繼續」、blocked 顯示「重跑」並在旁邊列出原因。按下去等於在終端機輸入 `/stage-xxx` 並送出。
- Claude Code 正在輸出時按鈕停用（滑鼠停留顯示「Claude Code 執行中，請稍候」）；輸出停 3 秒即啟用。
- 已完成的階段滑鼠停留可看到 commit 與完成時間。
- watcher 偵測到階段切換：階段列閃三下，右欄輸出區多一行「階段 ○○ 完成 → ○○」。
- Claude Code 停下來等你回覆時，側欄目前專案就會顯示「● 等待回覆」，與視窗有沒有聚焦無關；只有工作列閃爍與系統通知「<專案> 等待你的回覆」（點通知回到視窗）需要視窗在背景。

### 手動驗證

1. 開一個 design 階段的專案，等終端機出現提示符 3 秒後，「產品設計 繼續」按鈕應啟用；按下後終端機出現 `/stage-design` 並開始執行（按鈕立刻變灰、終端機開始輸出），而不是只把文字貼進輸入框。
2. Claude Code 回應期間按鈕應變灰。
3. 把視窗切到背景，等 Claude Code 問問題：工作列應閃爍並跳出通知；點通知回到視窗後閃爍停止。
4. 讓某階段完成（或手動改 `.pm/state.json` 的 `stage`）：階段列閃爍、輸出區出現「階段 … 完成 → …」。

## 文件分頁

- 中間區域有「終端機 / 文件 / 洞察」三個分頁。文件分頁左側列出目前階段的產出與整個 `docs/` 下的 Markdown，右側在 App 內渲染（GFM、表格、程式碼、mermaid 圖）。
- 上方階段列的文件按鈕：`.md` 直接在文件分頁開啟；其他檔案（demo 的 HTML）仍用系統預設程式開啟。「用外部程式開啟」按鈕也在。
- 文件中的相對連結會在 App 內跳轉，外部網址用系統瀏覽器開啟；內容一律經 DOMPurify 清理，不執行任何 script。
- 文件裡的相對圖片不會顯示（App 的 CSP 不允許載入本機檔案）；要看圖請用「用外部程式開啟」以外部檢視器閱讀。
- `docs/verify/checklist.md` 以清單模式顯示：勾選或取消會立刻寫回檔案，並只提交這個檔案（`docs(verify): 更新清單`），結果顯示在右欄輸出區。
- 文件在外部修改（Claude Code 寫入或編輯器存檔）後，停留在文件分頁時 2 秒內自動重載；停在終端機分頁時會先記著，切回文件分頁才更新。檔案被刪除時顯示「檔案已不存在」；超過 2 MB 的檔案請用外部程式開啟。

### 手動驗證

1. 開一個已完成產品設計的專案，切到「文件」，點 `product/prd.md`：標題、表格、程式碼區塊與 mermaid 圖都正常顯示。
2. 點文件內連到 `tasks.md` 的連結會切換到該文件；點外部網址會開瀏覽器。
3. 用編輯器修改 PRD 並存檔：2 秒內畫面更新。
4. 開 `verify/checklist.md` 勾一項：檔案內容變成 `[x]`，git 面板「歷史」多一筆 `docs(verify): 更新清單`，右欄輸出區顯示「驗證清單已更新並提交」。
5. 切回「終端機」：xterm 尺寸正確、游標可輸入；切換專案後回到終端機分頁。

## 洞察（跨專案 issue）

- 側欄底部「📊 洞察」或中間分頁「洞察」：列出根目錄下所有專案的 issue，依根因分組（規則與 `/stage-env` 寫入注意事項時相同），顯示次數、來源專案與修法；可依階段（產品實現 / 人工驗證）與時間（7 / 30 天）篩選。
- 展開群組可看到每筆 issue；「查看 commit」會切換到該專案並在右欄「歷史」分頁開啟該 commit。切換專案不會動到任何 session（見「多專案 session」），原本的對話都留著。
- 「釘選為注意事項」把 `- <根因> → 建議：<修法>` 寫進 `%USERPROFILE%\.claude-pm\pinned-notes.md`；之後「+ 新專案」/「初始化」產生的 CLAUDE.md 會在「固定注意事項」節帶入（`/stage-env` 不會改動這一節）。在洞察頁可移除釘選。
- state 損毀的專案會列在「略過」，不影響其他專案。

### 手動驗證

1. 兩個專案各有至少一筆 issue（可用 `node .pm/pm-state.mjs add-issue …` 製造）→ 洞察頁分組與次數正確；切換篩選計數跟著變。
2. 展開群組按「查看 commit」：左欄切到該專案，右欄歷史分頁顯示該 commit 內容。
3. 釘選一個根因 → `pinned-notes.md` 出現該行 → 新建專案的 CLAUDE.md「固定注意事項」含該行；在洞察頁移除後檔案清空。

## 多專案 session

- 每個專案各有一個 Claude Code session 與一個終端機實例，同時最多 4 個。切換專案只是換顯示，對話內容與捲軸都留著，不需要 `--continue` 重新載入。
- 側欄 pill：有 session 活著顯示綠點「● 執行中」；該 session 停在提示符等你回覆時改顯示黃點「● 等待回覆」（黃點優先）。
- 每列右邊的 `×`（「關閉 session」）會先跳確認框（`pty:kill <專案>`），確認後結束該專案的 Claude Code，右欄輸出區記一筆「已關閉 <專案> 的 session」。關掉的若是目前專案，終端機顯示「Claude Code 已結束 / 重新啟動」覆蓋層，按「重新啟動」會以 `--continue` 接續；關掉背景專案則連終端機實例一起收掉。
- 上限 4 個：要開第 5 個時跳出「同時開啟的 session 已達上限（4）」對話框並列出現有 session，關掉其中一個就自動接著開；按「取消」則畫面仍切到該專案，但顯示「Claude Code 未啟動 / 啟動」覆蓋層，之後隨時可以按「啟動」。
- 通知規則：**背景**專案（不是你正在看的那個）停下來等回覆時，即使視窗有焦點也會發系統通知「<專案> 等待你的回覆」——因為你根本看不到它；**目前**專案沿用原規則，只有視窗在背景時才通知。工作列閃爍一律只在視窗沒有焦點時發生；設定關掉「等待輸入時通知」則兩者都不發。
- 背景專案的 `.pm/state.json` 有變動時，側欄該專案的階段 pill 一樣 2 秒內更新。
- 階段按鈕、文件分頁、git 面板都只作用於目前專案。關掉視窗、結束 App 或換專案根目錄都會殺掉所有 session。

### 手動驗證

1. 開 A 專案讓 Claude Code 回一段話 → 切到 B（B 會自己啟動）→ 再切回 A：A 的終端機內容與對話都還在，也沒有重新啟動（側欄 A 全程有綠點或黃點）。
2. 讓 A 停在提示符後切到 B：即使視窗有焦點也會跳出「A 等待你的回覆」通知，側欄 A 顯示「● 等待回覆」，而上方 B 的階段按鈕不受影響（B 還在輸出就仍是灰的）。
3. 連續開 5 個專案：第 5 個跳出上限對話框；在對話框裡關掉一個之後，第 5 個自動啟動、側欄綠點跟著換人。
4. 對目前專案按 `×` → 確認：輸出區出現「已關閉 <專案> 的 session」、終端機顯示「Claude Code 已結束」；按「重新啟動」會以 `--continue` 接回原本的對話。

## 終端機快捷鍵

內嵌終端機沿用 Windows Terminal 的複製貼上習慣（選單列預設隱藏，但快捷鍵一律有效）：

| 按鍵 | 行為 |
| --- | --- |
| `Ctrl+Shift+C` / `Ctrl+Insert` | 複製目前選取的文字 |
| `Ctrl+C` | 有選取時複製；沒有選取時照常送出 `^C` 中斷 Claude Code |
| `Ctrl+Shift+V` / `Shift+Insert` / `Ctrl+V` | 把剪貼簿內容貼進 pty（多行原樣送出） |
| 右鍵 | 有選取時複製，沒有選取時貼上 |

滑鼠拖曳選取文字的行為不變。剪貼簿走 renderer 的 `navigator.clipboard`：
Electron 44 的 sandbox renderer 在 `file://` 頁面上已預設授予 `clipboard-read`／`clipboard-write`，
不會跳權限提示，因此不需要額外的 IPC 通道。

應用程式選單（`src/main/menu.ts`）另外註冊了「編輯」（copy／paste／selectAll）與
「檢視」（toggleDevTools／resetZoom／zoomIn／zoomOut）的標準 role，
讓這些加速鍵在 `autoHideMenuBar: true` 的情況下依然存在。「編輯」的 role 本身不會註冊
加速鍵，實際生效的是終端機自己會先 `preventDefault()` 的按鍵處理，所以不會重複觸發；
「檢視」的 role 則會註冊全域加速鍵，這正是選單刻意不放 `reload`／`forceReload` 的原因——
否則 Ctrl+R／Ctrl+Shift+R 會被 Electron 攔去重新載入視窗，讓使用者按 Ctrl+R 做 shell
reverse-search 時直接殺掉終端機工作階段。

## 環境注意事項

### 原生模組（node-pty）不需要 C++ 工具鏈

專案**沒有**設定 `postinstall` 的 electron-rebuild。node-pty 1.1.0 提供 N-API prebuild，可直接在
Electron 44 底下載入，因此一般開發機不需要安裝 Visual Studio Build Tools。
`electron-builder.yml` 也設定了 `npmRebuild: false`，打包時不會嘗試重建原生模組。

若未來升級 Electron 造成 ABI 不相容，再手動執行：

```bash
npm run rebuild    # electron-rebuild -f -w node-pty（選用）
```

### Windows Application Control 可能擋住 Electron 解壓

在部分受管控的 Windows 機器上，`npm install` 會在下載 Electron 後失敗，症狀是
`extract-zip` 解壓 Electron zip 時被 Windows Application Control 阻擋
（安裝停在 `electron` 的 postinstall，`node_modules/electron/dist` 為空或不存在）。

繞道方式：手動把 Electron 的快取 zip 解壓到 `node_modules/electron/dist`。
快取位於 `%LOCALAPPDATA%\electron\Cache\<version>\electron-v<version>-win32-x64.zip`：

```powershell
Expand-Archive "$env:LOCALAPPDATA\electron\Cache\<version>\electron-v<version>-win32-x64.zip" `
  -DestinationPath ".\node_modules\electron\dist" -Force
```

解壓後 `node_modules/electron/dist/electron.exe` 應該存在，`npm run dev` 即可正常啟動。

### npm 11 會略過 electron-winstaller 的 install script

`npm install` 可能出現 npm 11 跳過 `electron-winstaller` install script 的訊息。
本專案只產出 NSIS 與 portable 目標，不使用 Squirrel.Windows，因此可以忽略。

### 受管控機器上 portable exe 可能被 Application Control 擋下

同一套 Windows Application Control 政策也可能擋掉剛打包出來、未經正式簽章的
`dist\claude-pm 0.1.0.exe`（症狀：`Start-Process` 回報
`An Application Control policy has blocked this file.`）。
此時可改用 `dist\win-unpacked\claude-pm.exe` 驗證打包結果，或在未受管控的機器上測試安裝檔。
