總裁筆記助手 - 版本更新說明
🚀 重要更新：API 安全架構升級
為了避免 Gemini API Key 暴露在前端瀏覽器導致被盜用的風險，本版本引入了「後端中間層」架構。

1. 📂 專案架構異動
現在專案分為 前端 (Frontend) 與 後端 (Serverless API) 兩部分：

/api/gemini.js：後端程式碼。負責安全存放 API Key 並代替前端呼叫 Google 伺服器。

main.js：前端核心邏輯。現在不再直接呼叫 Google，而是呼叫我們自己的 /api/gemini 接口。

index.html / style.css：前端介面與美化。

2. 🛠️ 功能邏輯變更
API 串接轉向：main.js 中的 callGemini 函式已修改，現在改為請求 /api/gemini 路徑。

錯誤重試機制：保留了 callGemini 的 5 次指數退避重試 (Exponential Backoff Retry) 功能，確保在網路不穩時能自動重新嘗試。

安全性提升：瀏覽器的「開發者工具」現在只能看到對我們自己伺服器的請求，無法看到實際的 API Key。

3. 💻 本地開發環境安裝 (重要！)
由於引入了後端架構，現在不能直接用 Vite 啟動（Vite 讀不到 /api 內的後端程式），請隊友務必安裝 Vercel 環境：

第一步：全域安裝 Vercel CLI 
(!!!先直接npm install，若不能verce dev，再進行第一步)

npm install -g vercel

為什麼要裝 Vercel？
Vercel 是一個伺服器平台。產品上線後，API Key 會安全地存在雲端。在本地開發時，我們必須透過 vercel dev 指令來模擬伺服器環境，否則前端會找不到後端 API (api下的gemini.js也會被擋)。

第二步：設定 API Key
請在根目錄建立 .env 檔案，內容如下：

GEMINI_API_KEY='你的金鑰' or VITE_GEMINI_API_KEY='你的key'

第三步：啟動專案
在專案根目錄執行以下指令：

vercel dev

啟動後，請使用終端機顯示的網址（通常是 http://localhost:3000）進行測試。