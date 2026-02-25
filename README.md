# 總裁助理 - LectureNote AI App

這是一個基於 Vite + Gemini AI 開發的智能課堂筆記應用程式。支援語音即時轉錄、AI 自動摘要、智能測驗與知識擴充功能。

## 🚀 團隊成員快速上手指南

為了保護 API 安全，我們不將環境變數上傳至 GitHub。請每位成員依照以下步驟設定開發環境：

### 1. 複製專案 (Clone)
```bash
git clone https://github.com/A6ee/note-app-v1.git
cd lecture-note-app
```
### 2. 安裝套件
```bash
npm install
```
### 3. 設定 API Key 
在專案根目錄手動建立一個檔案，命名為 .env。

在檔案內輸入以下內容（請填入你自己的 Gemini API Key）：
```bash
VITE_GEMINI_API_KEY=你的_API_KEY
```
註：如果你還沒有 Key，請至 Google AI Studio 申請。

### 4. 啟動開發伺服器
```bash
npm run dev
```
啟動後，開啟瀏覽器訪問 http://localhost:5173 即可開始調試。
