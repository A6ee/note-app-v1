# MemorAIze — AI 課堂筆記助手

## 新增功能說明

### 1. 音檔匯入 + AI 自動筆記（Beta）

- 支援格式：`.mp3`、`.aac`、`.m4a`、`.wav`、`.ogg`
- 流程：上傳音檔 → [Deepgram](https://deepgram.com/) Nova-3 模型語音轉文字 → Gemini 整理成結構化筆記
- 自動偵測 MIME 類型（解決部分瀏覽器回傳空 MIME 的問題）

### 2. PDF 教材輔助匯入

- 可同時上傳音檔 + PDF 教材
- PDF 文字內容作為「輔助依據」，讓 Gemini 產生更精準的筆記
- 若未上傳 PDF，筆記僅依逐字稿生成

### 3. AI 生成進度條

- 音檔處理期間顯示擬真進度條
- 依任務是否含 PDF 分別顯示不同的進度階段文字

### 4. 安全性強化（Privacy）

- 後端 Console 僅輸出進度狀態，不輸出任何逐字稿或教材內容
- 前端不再直接呼叫 Google API，所有 API Key 存放於 Vercel 後端環境變數


## 環境變數設定

在專案根目錄建立 `.env` 檔案：

```env
GEMINI_API_KEY=你的_Gemini_API_Key
DEEPGRAM_API_KEY=你的_Deepgram_API_Key
```

> `.env` 已加入 `.gitignore`，不會被提交到 Git。

**Gemini API Key 取得：** https://aistudio.google.com/apikey  
**Deepgram API Key 取得：** https://console.deepgram.com/

## 本地開發測試流程

```bash
# 1. 安裝依賴
npm install

# 2. 安裝 Vercel CLI（若尚未安裝）
npm install -g vercel

# 3. 首次執行需連結 Vercel 帳號（依照提示操作）
vercel login

# 4. 啟動本地開發伺服器
vercel dev
```

啟動後瀏覽器開啟 `http://localhost:3000`。

> **為什麼不能用 `npm run dev`？**  
> `vite dev` 無法執行 `/api/` 下的 Serverless Functions，音檔上傳和 AI 功能會全部失敗。必須使用 `vercel dev`。

### 首次連結專案（`.vercel` 目錄不存在時）

```powershell
# 刪除失效的舊設定（若有）
Remove-Item -Recurse -Force .vercel

# 重新執行，CLI 會引導建立新專案
vercel dev
```

| 提示 | 建議回答 |
|------|---------|
| Set up and deploy? | `Y` |
| Which scope? | 選自己的帳號 |
| Link to existing project? | `N` |
| Project name? | 隨意命名 |
| In which directory? | `.`（直接 Enter）|

---

## 常見問題排解

### `vercel dev` 報錯：Could not retrieve Project Settings

`.vercel` 連結失效（通常是 clone 別人專案後發生）。

```powershell
Remove-Item -Recurse -Force .vercel
vercel dev
```

### 音檔上傳失敗：Gemini note generation failed

Gemini 服務繁忙（503）。已有自動重試機制，等待約 10 秒後重試一次即可。

### 音檔上傳失敗：Deepgram returned empty transcript

可能原因：
- 音檔沒有語音內容
- 音檔格式損壞
- 建議先用 `.mp3` 测試確認流程是否正常

### PDF 都看到「[PDF 沒有抽到文字]」

掃描版 PDF（圖片 PDF）無法抽取文字。請改用含文字層的 PDF。

---

## 分支說明

| Branch | 說明 |
|--------|------|
| `main` | 穩定版主幹，所有 PR 的合併目標 |
| `feature/YTHuang` | 音檔匯入、PDF 輔助、進度條、隱私修復 |

