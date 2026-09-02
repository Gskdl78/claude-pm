---
name: stage-design
description: 階段 2 產品設計。逐題釐清需求後寫出 PRD，依專案類型做 Demo（web 用可點擊 HTML 原型、cli 用最小可執行程式、其他用文件加流程圖）供使用者確認方向，commit 並標記 design 完成。
---

# 階段 2：產品設計

## 前置檢查
1. 執行 `node .pm/pm-state.mjs get`。
   - `stages.env.status` 不是 `done`：告訴使用者先執行 `/stage-env`，停止。
   - `stages.design.status` 是 `done`：告知已完成，建議 `/stage-tech`，停止。
   - `stages.design.status` 是 `in_progress` 且 `docs/product/prd.md` 已存在：先用 AskUserQuestion 問使用者要沿用既有 PRD 直接跳到步驟 C，還是重新釐清（回到步驟 A）。
2. 執行 `node .pm/pm-state.mjs start design`。
3. 讀 CLAUDE.md 取得專案類型與技術棧。

## 步驟 A：釐清需求
- 一次只問一題，能用選擇題就用 AskUserQuestion。
- 若 `superpowers:brainstorming` skill 可用，用它完成釐清，但**不要**讓它寫 spec 檔或進入 writing-plans；釐清完就回到本 skill 的步驟 B。
- 否則依序問：
  1. 目標使用者是誰？
  2. 要解決什麼問題？現在怎麼做？
  3. 核心使用流程（最多 3 條，每條從進入到完成）。
  4. 必要功能 / 加分功能 / 明確不做的功能。
  5. 成功判準（怎樣算做對了）。
- 每題後用一兩句複述你的理解，讓使用者糾正。

## 步驟 B：寫 PRD
寫 `docs/product/prd.md`，章節固定如下，每節都要有內容：
1. 一句話描述
2. 目標使用者
3. 問題與價值
4. 核心使用流程（每條流程分步驟）
5. 功能清單（必要 / 加分 / 明確不做）
6. 非功能需求（效能、平台、語言、離線需求）
7. 成功判準
8. 開放問題
完成後執行 `node .pm/pm-state.mjs add-doc design docs/product/prd.md`。

## 步驟 C：Demo（依 state.type）
- **web**：在 `docs/product/demo/` 產出可點擊的靜態 HTML 原型。假資料、inline CSS/JS、不需後端、不用框架。核心流程的每一步至少一個畫面，畫面之間用連結或 JS 切換。入口為 `docs/product/demo/index.html`，告訴使用者用瀏覽器開啟。
- **cli**：在 `docs/product/demo/` 用技術棧的語言（未定則用 Node）寫一支最小可執行程式，只印出核心流程的假輸出，不接真資料、不做錯誤處理。給出執行指令並自己跑一次貼出輸出。
- **library / other**：在 PRD 末尾新增「流程圖」節，用 mermaid 畫核心流程與主要物件關係；不產程式。
每個產出檔都執行 `node .pm/pm-state.mjs add-doc design <路徑>`。

## 步驟 D：確認方向
用 AskUserQuestion 問「方向對嗎？」，選項：
- 對，進入技術設計
- 要修改（請在 Other 寫要改什麼）
要修改就回到對應步驟修正，修完再問一次，直到選「對」。

## 步驟 E：收尾
```bash
git add -A
git commit -m "docs(design): 產品設計完成"
git rev-parse --short HEAD
```
執行 `node .pm/pm-state.mjs done design --commit <sha>`。
回報產出檔案清單，提示「下一步請執行 `/stage-tech`」。

## 禁止
- 不寫正式程式碼、後端、資料庫。
- 不選定技術棧（那是 `/stage-tech` 的事）；Demo 用的語言不代表最終決定。
- 不跳過確認方向。
