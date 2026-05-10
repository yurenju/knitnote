# Video Notes

一個 Chrome Extension，協助使用者在觀看 YouTube 影片時，以卡片盒筆記法（Zettelkasten）的精神做筆記。

## 動機

YouTube 雖然已經提供逐字稿，但被動閱讀逐字稿並不會真正內化知識。卡片盒筆記法強調用「自己的話」重寫所學，才能加深理解與記憶。本擴充功能希望幫助使用者在觀看影片的當下，於關鍵時間點寫下自己的理解，最後輸出成 Markdown 文獻筆記，匯入個人知識管理系統（如 Obsidian、Logseq 等）。

## 完整願景

當使用者觀看 YouTube 上的學習類影片，遇到有意思、值得保存的資訊時，可以開啟這個功能輸入筆記。筆記會被 attach 在特定的時間戳上，一支影片可以累積多條筆記。

匯出成 Markdown 時，會列出每一條筆記，並附上**周圍的 context**：

- 該時間戳前後的逐字稿
- 若可行，附上該時間點的畫面截圖

這樣的輸出就是一份完整的「文獻筆記（literature note）」，可以匯入個人知識管理系統（如 Obsidian、Logseq）後，再進一步加工成永久筆記。

## 開發狀態

專案剛起步，正在規劃 V1 範圍與 spec。

**V1（MVP）暫定範圍**：時間戳 + 文字筆記 + 匯出 .md（暫不含逐字稿、畫面截圖、AI 輔助 — 留待後續版本）。

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
- 不擷取逐字稿；不做 AI 改寫
- 沒有跨裝置同步；資料只存當前瀏覽器
