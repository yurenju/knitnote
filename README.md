# Video Notes

一個 Chrome Extension，協助使用者在觀看 YouTube 影片時，以卡片盒筆記法（Zettelkasten）的精神做筆記。

## 動機

YouTube 雖然已經提供逐字稿，但被動閱讀逐字稿並不會真正內化知識。卡片盒筆記法強調用「自己的話」重寫所學，才能加深理解與記憶。本擴充功能希望幫助使用者在觀看影片的當下，於關鍵時間點寫下自己的理解，最後輸出成 Markdown 文獻筆記，匯入個人知識管理系統（如 Obsidian、Logseq 等）。

## 核心概念

- **嵌入 YouTube**：使用者進入 YouTube 影片頁面時自動啟動。
- **時間戳筆記**：在影片的特定時間點，用自己的話寫下學到的知識。
- **匯出文獻筆記**：完成後可輸出成 Markdown 檔案，作為個人筆記系統中的「文獻筆記（literature note）」。

## 開發狀態

專案剛起步，尚在規劃階段。

## 技術

- Chrome Extension（Manifest V3）
- 目標平台：YouTube
