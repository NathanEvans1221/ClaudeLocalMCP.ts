# 變更紀錄

本文件記錄此專案的重要變更。

格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)，並遵循語意化版本。

## [未發布]

### 新增

- 新增天氣與翻譯服務的整合測試，以及 stdio 啟動設定測試。
- 新增 `npm test` 與 `npm run typecheck` 指令。

### 修正

- 啟動時立即驗證 OpenWeatherMap API Key 和 `.env` 路徑，預設讀取工作目錄下的 `.env`。
- 保留 `envPath` 等號右側完整路徑，並允許路徑含空白或等號。
- 城市名稱先修剪並驗證長度；英文城市直接查詢。
- 限制翻譯及天氣 HTTP 請求各 10 秒內完成，並驗證兩個服務的回應格式。
- 使用 MCP 工具錯誤標記回報驗證、授權、額度、逾時及連線錯誤，不洩漏 API Key。
- 更新 `.env` 放置與啟動說明。
