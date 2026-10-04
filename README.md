# ClaudeLocalMCP.ts
自己為 Claude 寫本地端 MCP Server 很簡單，有手就行😁
完整流程 Demo 的 gif 圖檔  
![MCP開啟圖示](./images/DemoMCP.gif)

# 簡介 MCP Server
MCP Server 就像「AI 的 USB 插槽」，讓 AI 能安全地連接外部資料或工具。  
舉例：AI 想查電腦檔案或查詢股票價格，MCP Server 就負責幫 AI 取得這些資料或執行操作。  
## AI 有了 MCP（模型上下文協定）後，將產生以下重大影響：
- AI 不再只是「建議者」，而能主動執行任務。例如，AI 不僅能告訴你怎麼查資料，還能直接幫你查詢資料庫、整理報表、發送郵件，甚至控制智慧家電  
- AI 可即時存取外部資料與工具，突破只能依賴訓練知識的限制，能根據最新數據做出回應，如即時天氣、最新財經資訊等  
- AI 回答更精確，能減少「幻覺」問題，因為可直接查證外部資料來源  
- 開發者只需一次整合 MCP，AI 就能連接多種工具和資料，開發效率大幅提升  
- 用戶資料安全性提升，因為存取權限可細緻控管，且多數操作在本地端執行  
總結：MCP 讓 AI 從只能「說」進化到能「做」，大幅擴展應用範圍與價值，推動 AI 進入真正的智能代理（AI Agent）時代  

## Weather MCP Server
這是用來給 Claude 查詢指定地區的天氣資訊

### 申請天氣 API 服務
我去申請 https://openweathermap.org/ 的免費服務
請去註冊並取得 API 金鑰 (API Key)

### 在 .env 填入金鑰
```shell
OPENWEATHERMAP_API_KEY=你的實際API金鑰貼在這裡
```
將 `.env` 放在專案根目錄，或在 MCP 啟動參數中提供 `.env` 路徑。預設會讀取目前工作目錄下的 `.env`。

```shell
npm install
npm run build
npm test
```

成功建置後，使用 Claude Desktop 的 `envPath` 參數指定專案根目錄下的 `.env`。

### 安裝 Claude 桌面版
https://claude.ai/download

### 開啟 Claude 開發模式
右上角 File => Settings
開啟 Developer 模式

### 設定 MCP Server 給 Claude 使用
Windows 用戶請  
開啟目錄 `C:\Users\使用者名稱\AppData\Roaming\Claude`  
檔案名稱 `claude_desktop_config.json`
```json
{
    "mcpServers": {
        "weather": {
            "command": "node",
            "args": [
                "D:\\github\\ClaudeLocalMCP.ts\\dist\\index.js",
                "envPath=D:\\github\\chiisen\\ClaudeLocalMCP.ts\\.env"
            ]
        }
    }
}
```
`envPath` 是 `.env` 檔案路徑。路徑中可包含空白或等號。也可以將 `OPENWEATHERMAP_API_KEY` 設為程序環境變數；沒有指定 `envPath` 時，伺服器會讀取工作目錄的 `.env`。

工具名稱為 `get_weather`。英文城市可直接查詢；中文城市會先使用 MyMemory 翻譯。若 MyMemory 額度不足或服務無法連線，請改用英文城市名稱。翻譯與天氣服務各有 10 秒請求期限。

確認一下 MCP 是否正常開啟  
![MCP開啟圖示](./images/ClaudeMCP01.png)
檢視一下 MCP 名稱  
![MCP開啟圖示](./images/ClaudeMCP02.png)
詢問時要指定地區，如: 台中天氣如何?  
Claude 會要你確認(Allow for this chat)是否可以執行 MCP 服務
![MCP開啟圖示](./images/ClaudeMCP03.png)

### 查詢 MCP Server 執行 log
Windows 用戶請  
開啟目錄 `C:\Users\使用者名稱\AppData\Roaming\Claude\logs`
