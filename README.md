# KnitNote

一個 Chrome Extension，協助使用者在觀看 YouTube 影片時，以卡片盒筆記法（Zettelkasten）的精神做筆記。

## 動機

YouTube 雖然已經提供逐字稿，但被動閱讀逐字稿並不會真正內化知識。卡片盒筆記法強調用「自己的話」重寫所學，才能加深理解與記憶。本擴充功能希望幫助使用者在觀看影片的當下，於關鍵時間點寫下自己的理解，最後輸出成 Markdown 文獻筆記，匯入個人知識管理系統（如 Obsidian、Logseq 等）。

## 完整願景

當使用者觀看 YouTube 上的學習類影片，遇到有意思、值得保存的資訊時，可以開啟這個功能輸入筆記。筆記會被 attach 在特定的時間戳上，一支影片可以累積多條筆記。

匯出成 Markdown 時，會列出每一條筆記，並附上**周圍的 context**：

- 該時間戳前後的逐字稿（前後 20 秒，可在 Options 調整）
- 該時間點的畫面截圖

這樣的輸出就是一份完整的「文獻筆記（literature note）」，可以匯入個人知識管理系統（如 Obsidian、Logseq）後，再進一步加工成永久筆記。

## 開發狀態

專案剛起步，正在規劃 V1 範圍與 spec。

**V1（MVP）暫定範圍**：時間戳 + 文字筆記 + 截圖 + 逐字稿 + 匯出 .md（暫不含 AI 輔助 — 留待後續版本）。

## 技術

- Chrome Extension（Manifest V3）
- 目標平台：YouTube

## 開發指令

```bash
npm install            # 第一次
npm run dev            # 開發模式（HMR；MV3 部分仍需到 chrome://extensions reload）
npm run build          # 產生 dist/，到 chrome://extensions 載入未封裝
npm test               # 單元測試
npm run e2e            # Playwright E2E（先 build；headed 模式）
```

E2E 預設跑 headed（看得到瀏覽器）。Playwright 的 Chromium 在 headless 模式下不會喚醒 MV3 service worker，所以擴充功能 E2E 一律 headed。

## 已知限制（V1）

- 截圖時若 YouTube 正在播廣告，會截到廣告畫面（V1 不偵測廣告）
- 不支援 YouTube Shorts、直播、嵌入頁
- 不做 AI 改寫
- 沒有跨裝置同步；資料只存當前瀏覽器
- 若 vault 在 OneDrive / Dropbox / iCloud 等雲端同步資料夾，孤兒截圖刪除可能因檔案鎖暫時失敗 — 匯出仍會完成，只是個別孤兒檔留著
- 截圖若意外失敗（如 `activeTab` 未授權），筆記會用 1×1 透明 PNG 當 placeholder 存檔，使用者文字不會丟失。下次按面板上的 toolbar icon 開啟（重新授權 activeTab）後新增的筆記就能正常截圖

## 逐字稿

匯出時每條筆記下方會附上 YouTube 逐字稿（前後 20 秒，可在 Options 調整），語言由 Options 「偏好逐字稿語言」決定（預設跟瀏覽器 UI 語言一致）。若該語言不是影片原生字幕、也不在 YouTube 自動翻譯支援清單中，該筆記就不附逐字稿（其他內容照常輸出）。

逐字稿在第一次替該影片新增筆記時自動抓取一次，存到 IndexedDB；之後新增筆記不會重抓。若使用者中途切換 Options 偏好語言，已抓過的影片不會自動重抓。

## 疑難排解

**匯出後 PNG 是空白或 1×1 像素？**

- 確認**面板是用 toolbar icon 或 `Alt+N` 開啟的**（這樣 Chrome 才會授予 `activeTab` 權限給截圖 API）
- 在 Options 頁按「**強制重新匯出全部**」會忽略上次匯出時間並覆蓋 `assets/` 內的所有 PNG
- 若是升級擴充功能版本後出現舊資料相容問題，刪除影片重新寫筆記是最乾淨的解法
