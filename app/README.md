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

## 設定檔

`%USERPROFILE%\.claude-pm\config.json`：
```json
{ "root": "C:\\Projects", "lastProject": "C:\\Projects\\my-app", "recent": [] }
```
改 `root` 可換專案根目錄。

## Git 面板

右欄（360px）是內建的 git 面板：上方是分支狀態與「推送 / 拉取 / 擷取」，中間是「變更 / 分支 / 歷史 / 進階」四個分頁，下方是輸出區。

- 每個會改變狀態的按鈕都先彈出確認框，顯示白話說明與將執行的確切 git 指令；會丟失工作的操作（丟棄、amend、hard reset、stash 丟棄、刪除標籤、中止合併）以紅色危險樣式呈現，焦點預設在「取消」。
- git 失敗時輸出區顯示繁體中文說明並附原始輸出；對映表在 `src/shared/git-errors.ts`。
- 面板在每次動作後、`.git` 有變化時（500ms 輪詢 `logs/HEAD`、`HEAD`、`index`、`MERGE_HEAD`、`refs/heads`、`FETCH_HEAD`、`packed-refs`、`refs/tags`、`refs/stash`）以及每 3 秒（視窗可見時）重讀狀態，所以終端機裡 Claude Code 的 git 操作與檔案編輯都會反映在面板。
- 「進階」分頁：收藏（`git stash push -u`，可附說明；清單可「取回」或「丟棄」）、重設（soft / mixed / hard 到 `HEAD~n` 或 hash；hard 為紅色危險確認）、標籤（建立於 HEAD 或指定提交、刪除、列表）。「歷史」分頁每筆 commit 有「還原 / 重設到此 / 標籤」；合併中的衝突橫幅有「中止合併」。
- 尚未設定遠端時按「推送 / 拉取」會開啟「發佈到 GitHub」精靈：偵測 GitHub CLI（`gh --version`、`gh auth status`）後可選「新建 GitHub 倉庫」（`gh repo create <名稱> --private|--public --source=. --remote=origin --push`）或「貼現有倉庫網址」（`git remote add origin <網址>` + `git push -u origin HEAD`；只接受 `https://` 或 `git@主機:帳號/倉庫`）。推送被拒時面板提示「先擷取」或「拉取（變基）」，不提供強制推送。
- `gh` 與 git 一樣在主程序以 `execFile` 執行，argv 只有三種白名單；倉庫名稱與網址都先驗證。
- 所有 git 都在主程序以 `execFile('git', argv)` 執行，路徑必須位於專案根目錄之內，檔案路徑、分支名、hash、訊息都經驗證後才組成 argv。

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

- 中間區域有「終端機 / 文件」兩個分頁。文件分頁左側列出目前階段的產出與整個 `docs/` 下的 Markdown，右側在 App 內渲染（GFM、表格、程式碼、mermaid 圖）。
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
