# MemorAIze — AI 課堂筆記助手

## 新增功能說明

桌機 Chrome：點登入，應優先 popup，成功後設定頁顯示已登入。
手機 Chrome/Safari：點登入，應走 redirect，回站後顯示已登入。
iOS 主畫面 PWA：點登入，應走 redirect（不再依賴 popup）。
LINE/IG 內建瀏覽器：先看到提示，建議改用系統瀏覽器後登入。

## 部屬環境設定 + 手動操作注意事項

# Vercel 沒有設定 Firebase 前端環境變數
你的登入是否啟用是由 firebaseClient.js 的 VITE_FIREBASE_* 判斷。少任一關鍵值就會直接停用 Auth。
必填至少這些：
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID

# 改完 Vercel 環境變數後沒有重新部署
這是 Vite 專案常見點：VITE_* 是 build-time 注入，不是 runtime。
只改 Environment Variables 不會立刻生效，必須重新 Deploy 一次。

# Firebase Console 沒開 Google Provider 或沒加授權網域
你的登入是 signInWithPopup（authService.js），需要：
Firebase Authentication > Sign-in method > Google：Enabled
Firebase Authentication > Settings > Authorized domains：加入
你的 vercel 網域（例如 xxx.vercel.app）
自訂網域（若有）
localhost（本機測試用）

# 瀏覽器把 Popup 擋掉
你使用的是 popup 流程，不是 redirect。若被瀏覽器/內嵌 WebView 擋掉，就會像沒反應。
建議先用桌面 Chrome 直接開站測試，允許彈窗。

## 開發環境設定

### 1. 安裝套件

在專案根目錄執行：

```bash
npm install
```

### 2. 建立 `.env`

本專案建議後續統一使用 `.env` 作為環境變數檔，請在專案根目錄建立或維護 `.env`。

請至少放入以下 Firebase 設定：

```env 
VITE_FIREBASE_API_KEY=你的 Firebase API Key
VITE_FIREBASE_AUTH_DOMAIN=你的 Firebase Auth Domain
VITE_FIREBASE_PROJECT_ID=你的 Firebase Project ID
VITE_FIREBASE_STORAGE_BUCKET=你的 Firebase Storage Bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=你的 Firebase Messaging Sender ID
VITE_FIREBASE_APP_ID=你的 Firebase App ID
```

```env
GEMINI_API_KEY=你的 Gemini API Key
```

若你目前仍沿用舊版設定，也可暫時保留 `VITE_GEMINI_API_KEY` 作為相容欄位；但後續新版本建議以 `GEMINI_API_KEY` 為主。

### 3. Firebase Console 設定

請確認 Firebase 專案已完成以下設定：

- 開啟 Authentication
- 啟用 Google Sign-In Provider
- 建立 Firestore Database
- Firestore Rules 允許使用者只能存取自己的筆記資料

## 開發啟動方式

### 情境 A：只測試前端 + Google 登入 + Firestore 同步

使用 Vite 即可：

```bash
npm run dev
```

這個模式適合測試：

- `localforage` 本機保存
- Google 登入 / 登出
- Firestore 雲端同步
- 多視窗同步驗證

### 情境 B：要連同 `/api/gemini` 一起測試

如果你要測 AI 摘要、AI 生成或任何會打到 `/api/gemini` 的功能，請改用：

```bash
npx vercel dev
```

原因是 `api/gemini.js` 屬於 serverless route，`npm run dev` 不會啟動這條 API。

如果本機尚未安裝 Vercel CLI，可先執行：

```bash
npm install -g vercel
```

如果工作區內仍有舊的 `.env.local`，建議移除，避免與 `.env` 內容不一致。

## 測試流程

### A. 測試 `localforage` 本機保存

1. 啟動專案。
2. 不登入帳號，直接新增或修改筆記。
3. 重新整理頁面。
4. 確認剛剛的筆記內容仍然存在。

預期結果：未登入時，筆記仍可透過 `localforage` 保留在本機。

### B. 測試 Google 登入

1. 點擊登入按鈕。
2. 選擇 Google 帳號完成登入。
3. 回到 App 後確認畫面顯示已登入狀態。

預期結果：登入成功後，前端會取得目前使用者資訊，並準備進行筆記同步。

### C. 測試 Firestore 雲端同步

1. 保持登入狀態下新增一則筆記。
2. 到 Firebase Console 的 Firestore 查看資料。
3. 確認資料寫入在對應使用者的 notes 路徑下。

預期結果：新筆記會同步到 Firestore，且資料只屬於目前登入使用者。

### D. 測試跨視窗同步

1. 開兩個瀏覽器分頁或兩個視窗。
2. 以同一個 Google 帳號登入。
3. 在其中一個視窗新增或修改筆記。
4. 觀察另一個視窗是否同步到更新內容。

預期結果：另一個視窗應能看到最新筆記內容，代表本機與雲端同步流程正常。

### E. 測試登出後行為

1. 在登入狀態下先確認同步正常。
2. 執行登出。
3. 再新增或修改筆記。
4. 重新整理頁面檢查本機資料是否仍存在。

預期結果：登出後不再進行該帳號的雲端同步，但本機仍可繼續使用與保存筆記。


若需要結束所有本機 Node 開發程序：

```bash
taskkill /F /IM node.exe
```
