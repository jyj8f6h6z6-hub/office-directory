# 水利處電話簿

純靜態網頁（府內分機＋府外電話），資料以 AES-256-GCM 加密，輸入密碼後才會在瀏覽器解開。
發布在 GitHub Pages，不需要伺服器。

```
docs/               ← 會被發布的網頁（只含加密後的資料）
  index.html / style.css / app.js
  data.enc.js       ← 加密後的資料（由 build 產生）
data-source/        ← 明文 CSV（已被 .gitignore，不會上傳）
  internal.csv      府內分機
  external.csv      府外電話
tools/build.mjs     ← 讀 CSV → 加密 → 產生 docs/data.enc.js
```

## 日常更新資料

1. 在 Google 試算表改好資料，「檔案 → 下載 → CSV」。
2. 覆蓋 `data-source/internal.csv`（或 `external.csv`）。欄位固定為：`單位,子單位,職稱,姓名,分機`。
3. 在 VS Code 終端機執行（**請換成你自己的密碼**）：
   - Windows PowerShell：`$env:DIR_PASSWORD="你的密碼"; node tools/build.mjs`
   - macOS / Linux：`DIR_PASSWORD='你的密碼' node tools/build.mjs`
   - 或直接 `node tools/build.mjs`，依提示輸入密碼
4. 推上 GitHub：
   ```
   git add docs
   git commit -m "更新分機表"
   git push
   ```
   約 1 分鐘後網頁就會更新。

需要 [Node.js](https://nodejs.org) 18 以上。

## 第一次發布到 GitHub Pages

1. 在 GitHub 建立**公開**倉庫（免費帳號的 Pages 需要公開倉庫）。
2. 在專案資料夾：
   ```
   git init
   git add .
   git commit -m "first commit"
   git branch -M main
   git remote add origin https://github.com/你的帳號/倉庫名.git
   git push -u origin main
   ```
3. GitHub 倉庫 → Settings → Pages → Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾選 **/docs** → Save。
4. 網址為 `https://你的帳號.github.io/倉庫名/`。

## ⚠️ 重要：先換掉密碼

目前 `docs/data.enc.js` 是用**測試密碼 `demo-password-1234`** 加密的。
推上 GitHub 前，請依上面「日常更新」第 3 步用自己的密碼重新執行一次 build。

## 安全說明

- 資料在瀏覽器端解密；GitHub 上只有加密檔，無密碼無法讀取。
- 網頁程式本身是公開的，只有資料受保護。
- 全單位共用一組密碼：密碼太短可能被暴力破解（建議 10 碼以上）；人員異動或密碼外流時請換密碼並重新 build。
- 已加上 `noindex`，搜尋引擎不會收錄。
- **不要**把 `data-source/` 或密碼推上 GitHub（`.gitignore` 已排除 `data-source/`）。
- 若倉庫曾經推上過明文資料，即使之後刪除，Git 歷史仍然留得到，需要重建倉庫。

## 本機預覽

在 VS Code 安裝 Live Server 擴充功能，對 `docs/index.html` 按右鍵 → Open with Live Server。
