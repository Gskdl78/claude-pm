---
name: stage-verify
description: 階段 5 人工驗證。產出人工測試清單，接收使用者回報的問題，逐一記錄 issue、派 subagent 修正（opus 實作、fable 審核）並 commit，直到使用者確認驗證完成。
---

# 階段 5：人工驗證

## 前置檢查
1. 執行 `node .pm/pm-state.mjs get`。
   - `stages.build.status` 不是 `done`：請使用者先執行 `/stage-build`，停止。
   - `stages.verify.status` 是 `done`：告知專案已完成，停止。
   - `stages.verify.status` 是 `blocked`：說明 `reason`，詢問使用者如何處理，同意後才繼續。
2. 若 `stages.verify.status` 是 `pending`，或是 `blocked` 且使用者已同意繼續，執行 `node .pm/pm-state.mjs start verify`（此舉會清除 blocked 標記並設回 in_progress）。
   從 `blocked` 恢復時，還要多做兩件事：
   a. 跑 `git status`。若有殘留變更，用 AskUserQuestion 問使用者要 `git stash`、丟棄（`git checkout -- .` 並清掉未追蹤檔案）、還是沿用這些變更，照回答執行後才往下。
   b. 用 AskUserQuestion 問 `reason` 裡那個被卡住的 issue `<id>` 要「重試」還是「結案」：
      - 重試：回到步驟 B.2 重派修正，該 issue 的退回次數計數器歸零（重新從第 1 次算起）。
      - 結案：執行 `node .pm/pm-state.mjs update-issue <id> --fix "手動處理"`，然後繼續處理其他回報。
3. 讀 CLAUDE.md、`docs/product/prd.md`、`docs/tech/tasks.md`。取專案絕對路徑：`pwd -W`（Git Bash 會印出 Windows 原生路徑；非 Windows 用 `pwd`）。

## 步驟 A：產出清單（若 `docs/verify/checklist.md` 已存在則跳到步驟 B）
依 PRD 的核心使用流程與 tasks.md 每個任務的驗收條件，寫 `docs/verify/checklist.md`：
```
# 人工驗證清單
啟動方式：<從 CLAUDE.md 的建置與執行指令整理>

## 流程 1：<名稱>
- [ ] 步驟 1：<操作> → 預期：<結果>
- [ ] 步驟 2：…

## 邊界情況
- [ ] <空輸入 / 錯誤輸入 / 中斷> → 預期：<結果>
```
執行 `node .pm/pm-state.mjs add-doc verify docs/verify/checklist.md`，然後：
```bash
git add -A
git commit -m "docs(verify): 產出驗證清單"
```
告訴使用者：「請依清單測試。有問題就告訴我是哪一項、實際發生什麼；全部通過請說『驗證完成』。」

## 步驟 B：處理每一個回報的問題
1. 記錄：`node .pm/pm-state.mjs add-issue --stage verify --symptom "<使用者描述>"`，記下 id。
2. **修正**：派 subagent，model `opus`（涉及認證、權限、資料遺失、加密則 `fable`）。Prompt：
   ```
   你在專案 <絕對路徑> 工作。先讀 CLAUDE.md。使用者在人工驗證時回報：

   <症狀原文>

   請：先寫一個能重現此問題的失敗測試並執行確認失敗；找出根因；做最小修正；執行完整測試通過。不要 commit。
   回報：根因（一句）、修法（一句）、改了哪些檔案、測試輸出摘要。
   ```
3. **審核**：派 model `fable` 的 subagent。Prompt：
   ```
   你是審核者，專案在 <絕對路徑>。使用者回報的問題：

   <症狀原文>

   實作者回報：

   <回報全文>

   請執行 `git diff`、跑完整測試、確認新增的測試確實重現原問題（把修正暫時還原應該會失敗）、確認沒有引入無關變更。
   回覆第一行必須是 `VERDICT: PASS` 或 `VERDICT: FAIL`，之後條列具體問題（檔案:行號、原因、修法）。
   ```
4. **若 FAIL**：每一次退回都要記錄，不可只記最後一次。先做 a 的次數檢查，通過才往下做 b、c。
   a. **次數上限檢查（第一個一定要做的動作）**：若這是該任務（issue）第 3 次 FAIL：記錄 issue / log（同 b）後執行 `node .pm/pm-state.mjs block verify --reason "issue <id> 修正 3 次未過"`，用 AskUserQuestion 詢問使用者如何處理，停止，不再往下（不得再派修正 subagent）。也就是同一個 issue 最多派 3 次修正（1 次初版 + 2 次修正），絕不派第 4 次。
   b. 在 `docs/build/log.md` 追加：
      ```
      ## 驗證修正 issue <id> 退回 #<第幾次>
      - 症狀：<審核者指出的症狀>
      - 根因：<審核者指出的根因>
      - 修法：<審核者建議的修法>
      ```
   c. 把審核者的問題全文交回修正 subagent 再修，回到步驟 3。
5. PASS：
   ```bash
   git add -A
   git commit -m "fix(verify): <症狀摘要>" -m "Fixes: <症狀原文>"
   git rev-parse --short HEAD
   ```
   `node .pm/pm-state.mjs update-issue <id> --cause "<根因>" --fix "<修法>" --commit <sha>`。
   （修正本身的 commit 只含程式與測試；紀錄留到步驟 6 一起提交。）
6. 補紀錄並提交：在 `docs/build/log.md` 追加 `## 驗證修正 issue <id> — <sha>` 與症狀 / 根因 / 修法，在 checklist.md 對應項目後加 `（已修正 <sha>）`，然後 `git add -A && git commit -m "docs(verify): 更新清單"`——log.md 與 checklist.md 的這兩筆更新都落在這一個 commit 裡。
7. 請使用者重測該項。

## 步驟 C：完成
使用者說「驗證完成」時：
```bash
git rev-parse --short HEAD
```
執行 `node .pm/pm-state.mjs done verify --commit <sha>`。
回報：verify 階段 issue 數、對應 commit 清單，並說明專案 stage 已為 done。若使用者之後要新增功能，建議在 `docs/tech/tasks.md` 追加任務後重新執行 `/stage-build`（需先用 `node .pm/pm-state.mjs get` 確認狀態，必要時請使用者決定是否重開 build 階段）。

## 規則
- 主 session 不自己改程式碼。
- 每個問題修正都要獨立 commit 並記錄 issue。
- 把審核者或使用者的文字帶進 `--symptom` / `--cause` / `--fix` / `--reason` 或 `git commit -m` 之前，先移除或替換反引號、`$`、雙引號（例如把 `"` 換成 `'`），並把每個值壓成一行；Git Bash 會在雙引號內展開這些字元。
