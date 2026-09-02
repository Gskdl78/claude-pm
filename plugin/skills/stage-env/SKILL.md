---
name: stage-env
description: 階段 1 環境搭建。建立專案後第一個執行：確認專案類型與語言、補齊 CLAUDE.md 與 .gitignore、寫入歷史專案注意事項、建立最小骨架、commit 並標記 env 完成。
---

# 階段 1：環境搭建

## 前置檢查
1. 執行 `node .pm/pm-state.mjs get`。
   - 若 `stages.env.status` 是 `done`：告訴使用者環境已完成，建議執行 `/stage-design`，然後停止。
   - 若 `stages.env.status` 是 `blocked`：說明 `reason`，詢問使用者是否重跑；同意才繼續。
2. 執行 `node .pm/pm-state.mjs start env`。

## 步驟
1. 用 AskUserQuestion 問專案類型，一次一題：
   - 類型：web（有網頁介面）/ cli（命令列工具）/ library（給其他程式用的套件）/ other。
   - 主要語言或框架（開放式，可回答「還沒決定」）。
2. 執行 `node .pm/pm-state.mjs set-type <type>`。
3. 執行 `node .pm/pm-state.mjs history`。把 `count >= 2` 的項目整理成條列，格式：`- <根因> → 建議：<fixes 合併>`（來源專案：<projects>）。用這些條列取代 CLAUDE.md「注意事項（來自歷史專案）」節的內容；沒有符合項目就寫「（尚無歷史注意事項）」。
4. 編輯 CLAUDE.md：
   - 「專案類型：」改為選定的類型。
   - 若語言/框架已決定：「技術棧」節寫上語言與框架；「建置與測試指令」節寫上該生態的標準指令（例如 Node：`npm test`、`npm run build`；Python：`pytest`）。未決定則兩節維持「待技術設計階段決定」。
5. 依語言補 `.gitignore`（追加在既有內容之後）：
   - Node：`node_modules/`、`dist/`、`out/`、`coverage/`
   - Python：`__pycache__/`、`.venv/`、`*.pyc`、`.pytest_cache/`、`dist/`
   - Go：`bin/`
   - Rust：`target/`
   - 未決定：不追加。
6. 若語言已決定，建立最小骨架，只到「測試框架能跑一個空測試」為止：
   - Node：`npm init -y`，`package.json` 加 `"type": "module"`、`"scripts": { "test": "vitest run" }`，`npm i -D vitest`，建 `tests/smoke.test.js` 內容為一個 `expect(true).toBe(true)`，跑 `npm test` 確認通過。
   - Python：建 `pyproject.toml`（name、version、`[tool.pytest.ini_options]`），`tests/test_smoke.py` 內容 `def test_smoke(): assert True`，跑 `pytest` 確認通過。
   - 其他語言：建該語言慣例的最小專案檔與一個空測試，跑一次確認。
   - 未決定：跳過此步。
7. Commit：
   ```bash
   git add -A
   git commit -m "chore(env): 環境搭建完成（<type>）"
   git rev-parse --short HEAD
   ```
8. 執行 `node .pm/pm-state.mjs done env --commit <sha>`。
9. 回報：列出建立或修改的檔案、專案類型、技術棧，並提示「下一步請執行 `/stage-design`」。

## 禁止
- 不寫任何功能程式碼。
- 不跳過 commit。
- 不手動編輯 `.pm/state.json`。
