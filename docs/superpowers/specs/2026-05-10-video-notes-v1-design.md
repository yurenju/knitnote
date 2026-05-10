# Video Notes V1 — 設計文件

**狀態**：草稿
**日期**：2026-05-10
**範圍**：V1（MVP）

## 1. 範圍與用途

V1 是一個 Chrome MV3 擴充功能，僅在 `https://www.youtube.com/watch?v=*` 啟動。讓使用者：

- 在影片特定時間戳記筆記
- 自動截取該時間點的畫面
- 匯出成符合卡片盒筆記法精神的 Markdown 文獻筆記，寫入使用者授權的本機 vault 資料夾

**不在 V1 範圍**：

- YouTube Shorts、直播、嵌入頁
- 逐字稿擷取與引用
- AI 改寫 / 摘要
- 雲端同步
- 跨裝置同步
- 自動匯出 / 匯出排程

## 2. 完整使用者流程

1. 使用者進入 `youtube.com/watch?v=...` 頁面
2. 點擊 toolbar 上的擴充功能 icon（或按 `Alt+N`）→ 右側欄面板開啟，取代相關影片區
3. 看到精彩段落時按面板上的「+ 新增筆記」按鈕
4. 影片若在播放中則自動暫停（已暫停則維持暫停）；輸入框 focus
5. 使用者可在 YouTube 播放器調整 scrub 改變時間戳
6. 寫完筆記內容後按「Save」：
   - 時間戳 = 該瞬間 `videoEl.currentTime`
   - 截圖 = 該瞬間 `chrome.tabs.captureVisibleTab` 結果裁切到 video 區
   - 兩者跟筆記文字一起存到本地
7. 列表新增一條筆記，按時間戳升序排列
8. 點筆記時間戳 → 影片 seek 到該時間
9. hover 筆記顯示「編輯 / 刪除」按鈕
10. 寫完後到 Options Page（chrome://extensions 點本擴充功能的「選項」）
11. 第一次匯出：跳資料夾選擇器，選 vault 根目錄（如 Obsidian vault）
12. 之後匯出：直接寫入記住的 vault，產生 `YYYY-MM-DD_<title>/note.md` + `assets/<時間戳>.png`

## 3. 架構

```
┌──────────────────────────────────────────────────────────────┐
│ Service Worker (background)                                   │
│  • chrome.tabs.captureVisibleTab() 截圖                        │
│  • 訊息中介、跨 context 協調                                    │
└──────────────────────────────────────────────────────────────┘
        ▲                              ▲
        │ chrome.runtime.sendMessage   │
        │                              │
┌───────┴───────────────────┐  ┌───────┴────────────────────┐
│ Content Script             │  │ Options Page                │
│ （注入 youtube.com/watch）│  │  • Vault 選擇                │
│  • 偵測 video 元素           │  │  • 影片清單                  │
│  • 注入面板 (Shadow DOM)    │  │  • 匯出全部 / 個別匯出       │
│  • Preact 渲染面板 UI         │  │  • FSA write/read 走這裡    │
│  • 寫入/讀取 chrome.storage  │  │                             │
└───────────────────────────┘  └────────────────────────────┘
                                          │
                                          ▼
                        ┌──────────────────────────────┐
                        │ Storage                       │
                        │  chrome.storage.local         │
                        │   ├ videos (metadata + notes) │
                        │   └ settings                  │
                        │  IndexedDB                    │
                        │   ├ screenshots (Blob)         │
                        │   └ meta (vaultHandle)         │
                        └──────────────────────────────┘
```

### 3.1 元件職責

**Content Script**

- 偵測 `<video>` 元素載入完成
- 偵測 SPA 切換影片（監聽 `yt-navigate-finish` 事件 + URL 變化），重新載入面板狀態
- 將面板以 Shadow DOM 注入頁面（避免 CSS 互相污染），位置取代 `#secondary` 區
- 用 Preact 渲染面板 UI（空狀態、寫筆記中、列表三種狀態）
- 處理面板互動：新增、編輯、刪除、點時間戳 seek
- 截圖請求透過 `chrome.runtime.sendMessage` 送到 service worker，拿到 dataURL 後在 canvas 裁切並存進 IndexedDB

**Service Worker**

- 收到截圖請求 → 呼叫 `chrome.tabs.captureVisibleTab` → 回傳 dataURL
- 處理 toolbar icon 點擊 → 切換當前分頁面板的開關狀態（送訊息給 content script）
- 處理 keyboard command (`Alt+N`) → 同上
- 監聽 chrome.storage.onChanged → 更新 toolbar badge 數字（每支影片獨立）

**Options Page**

- 顯示 vault 路徑（從 IndexedDB 讀 handle，呼叫 `handle.name` 顯示資料夾名稱）
- 「變更 vault」按鈕 → `showDirectoryPicker()` → 存新 handle 到 IndexedDB
- 列出所有有筆記的影片（從 chrome.storage 讀 `videos`）
- 「匯出」/「匯出全部」按鈕 → 執行匯出邏輯（見 §6）
- 「刪除」按鈕 → 確認後從 chrome.storage 移除影片，並從 IndexedDB 刪對應截圖；**不動 vault 內已匯出的資料夾**

### 3.2 為什麼匯出在 Options Page 而非面板

File System Access API 的 `FileSystemDirectoryHandle` 在 SPA 環境（YouTube）容易因 navigation 失效。Options Page 是獨立分頁，handle 生命週期穩定。代價：使用者要去 Options 才能匯出，但 V1 接受這個取捨；之後可改面板上加一顆「在 Options 開啟並匯出」捷徑按鈕。

### 3.3 為什麼用 Shadow DOM

YouTube 的 CSS 規則複雜且常變動，直接注入 DOM 會發生樣式互相污染。Shadow DOM 提供完整隔離，我們的面板樣式不受 YouTube 影響，反之亦然。

## 4. 資料模型

### 4.1 chrome.storage.local

```js
{
  videos: {
    "<videoId>": {
      videoId: "abc123",
      title: "How to learn anything fast",
      channel: "Some Channel",
      url: "https://www.youtube.com/watch?v=abc123",
      firstNoteAt: "2026-05-10T14:30:00+08:00",   // 用於資料夾命名，永不變
      lastModifiedAt: "2026-05-10T15:12:33+08:00",
      lastExportedAt: "2026-05-10T15:00:00+08:00", // null 表示未匯出
      notes: [
        {
          id: "note_<uuid>",
          timestampSec: 222,
          text: "我用自己的話寫的內容…",
          createdAt: "2026-05-10T14:30:00+08:00",
          updatedAt: "2026-05-10T14:35:00+08:00",
          screenshotKey: "shot_<uuid>"  // → IndexedDB
        }
      ]
    }
  },
  settings: {
    theme: "system",                    // "system" | "light" | "dark"
    hasVaultConfigured: true            // UI 提示用，真正的 handle 在 IndexedDB
  }
}
```

### 4.2 IndexedDB（用 `idb` 套件）

- Database: `video-notes`
- Object stores:
  - `screenshots`：`key = shot_<uuid>`, `value = Blob (image/png)`
  - `meta`：`key = "vaultHandle"`, `value = FileSystemDirectoryHandle`

### 4.3 衍生規則

- 新增筆記 → 寫入 `notes` 陣列 + 更新 `lastModifiedAt` + 寫 IndexedDB screenshot
- 編輯筆記文字 → 更新該筆 `text` + `updatedAt` + `lastModifiedAt`（**截圖不能改**）
- 刪除筆記 → 從 `notes` 陣列移除 + 從 IndexedDB 刪對應 screenshot + 更新 `lastModifiedAt`
- 刪除整支影片 → 級聯刪所有 notes 的 screenshot
- `lastModifiedAt > lastExportedAt` 表示有未匯出變更

## 5. 主要 UI 畫面

### 5.1 面板（注入到 youtube.com/watch 右側）

三種狀態：

1. **空狀態**：「+ 新增筆記」CTA + 空狀態提示文字
2. **寫筆記中**：影片自動暫停，inline 輸入卡片顯示當前時間戳（隨 scrub 即時更新），Save / 取消按鈕
3. **已有筆記**：時間戳升序列表，每條顯示時間戳 + 文字摘要，hover 顯示編輯/刪除

寬度 = YouTube `#secondary` 區域寬度（瀏覽器寬度自適應）。

### 5.2 Options Page

- 上方：vault 資料夾顯示 + 變更按鈕
- 中段：theme 選擇（跟隨系統 / 強制深色 / 強制淺色）
- 下方：影片清單，每行顯示標題、筆記數、最後編輯時間、匯出狀態 + 匯出/刪除按鈕；頂端有「匯出全部」按鈕

### 5.3 Toolbar Icon

- Badge 顯示當前分頁影片的筆記數（無筆記則無 badge）
- 點擊 → 切換面板開關

### 5.4 Theme

- 預設跟隨 `prefers-color-scheme`
- options 提供三選項：`system` / `light` / `dark`
- 面板與 options page 共用 CSS variable token，切換 theme 透過 root class

## 6. 匯出邏輯

### 6.1 觸發

從 Options Page：

- 「匯出」（單支影片）：對該影片執行匯出
- 「匯出全部」：迭代所有 `videos`，對每支執行匯出，顯示進度

### 6.2 流程（單支影片）

1. **檢查 vault handle**：從 IndexedDB 讀 `vaultHandle`。若不存在 → 跳資料夾選擇器，選完寫入 IndexedDB。
2. **驗證權限**：`vaultHandle.requestPermission({mode:'readwrite'})`。若使用者拒絕 → 顯示錯誤、終止。
3. **檢查是否需要寫入**：若 `lastModifiedAt <= lastExportedAt` → 顯示「已是最新」，不動磁碟，結束。
4. **計算資料夾名稱**：`<firstNoteAt 的 YYYY-MM-DD>_<sanitized_title>`，例如 `2026-05-10_How-to-learn-anything-fast`。`firstNoteAt` 取自 chrome.storage，永不變動，確保同支影片重複匯出資料夾名一致。
5. **建立資料夾**：`vaultHandle.getDirectoryHandle(folderName, {create: true})`。
6. **寫 note.md**：用 §7 的格式產生內容 → `folder.getFileHandle('note.md', {create: true})` → `writable.write(content)`。
7. **寫 assets**：對 `notes` 中每筆，從 IndexedDB 讀 screenshot Blob → `assets/<時間戳>.png`。
   - 增量寫入：先列出 `assets/` 內現有檔名，只寫新增的（未在現有清單中的）。
   - 刪除清理：對於 `assets/` 內存在但 `notes` 已不參考的檔案，刪除。
8. **更新 `lastExportedAt` = now**。

### 6.3 檔名 sanitization

- 替換禁字（`<>:"/\|?*` 與 ASCII 控制字元）為 `-`
- 去除頭尾空白
- 去除結尾的點號
- 偵測 Windows 保留名（`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`）→ 前綴 `_`
- 截斷到 100 字元（路徑總長保留緩衝）
- 空字串 fallback 用 `videoId`

### 6.4 截圖檔名

- 格式：`HH-MM-SS.png`（冒號替換為破折號）
- 同支影片若兩條筆記時間戳同秒（極罕見），加 `-2`、`-3` 後綴

## 7. note.md 格式

````markdown
---
title: <影片標題>
url: https://www.youtube.com/watch?v=<videoId>
channel: <頻道名稱>
videoId: <videoId>
firstNoteAt: 2026-05-10T14:30:00+08:00
exportedAt: 2026-05-10T15:00:00+08:00
noteCount: 3
---

# <影片標題>

來源：[YouTube](https://www.youtube.com/watch?v=<videoId>)
頻道：<頻道名稱>

---

## [00:03:42](https://www.youtube.com/watch?v=<videoId>&t=222s)

![](assets/00-03-42.png)

> 我用自己的話寫的筆記內容…

---

## [00:12:05](https://www.youtube.com/watch?v=<videoId>&t=725s)

![](assets/00-12-05.png)

> 第二條筆記…
````

設計重點：

- frontmatter 用 YAML，方便 Obsidian / Logseq 解析
- 每條筆記用 `## hh:mm:ss` heading；連結帶 `&t=Xs` 可跳到 YouTube 對應時間
- 截圖 `assets/<時間戳>.png` 相對路徑
- 筆記文字用 blockquote 區隔

## 8. 互動細節

### 8.1 開啟面板

- 點 toolbar icon：service worker 收到 `action.onClicked` → 送訊息給該分頁 content script「toggle」
- 按 `Alt+N`：service worker 收到 `commands.onCommand('toggle-panel')` → 同上
- content script 收到 toggle → 注入或移除面板 DOM

### 8.2 新增筆記流程

1. 使用者按「+ 新增筆記」
2. 若 `videoEl.paused === false` → `videoEl.pause()`
3. 顯示 inline 輸入卡片，文字框 focus
4. 卡片頂端顯示當前時間戳，每 250ms 更新一次（隨 scrub 即時反應）
5. 使用者按 Save：
   - 記錄 `timestampSec = videoEl.currentTime`
   - 確保 video 在 viewport（`videoEl.scrollIntoView({block:'center'})` + 100ms wait）
   - 透過 sendMessage 請 service worker 截圖 → 拿到 dataURL
   - 在 canvas 用 `videoEl.getBoundingClientRect()` 裁切到 video 區
   - canvas → Blob → 存 IndexedDB（key = `shot_<uuid>`）
   - 寫筆記到 chrome.storage：含 text、timestampSec、screenshotKey
   - 更新 `lastModifiedAt`
6. 卡片消失，列表新增該筆

### 8.3 編輯

- click 編輯按鈕 → 該筆變 inline 輸入卡片，預填現有 text
- Save → 更新 text + `updatedAt` + `lastModifiedAt`（截圖不變）
- 取消 → 還原顯示

### 8.4 刪除

- click 刪除 → 確認對話框
- 確認 → 從 chrome.storage 移除 + 從 IndexedDB 刪 screenshot + 更新 `lastModifiedAt`

### 8.5 點時間戳跳轉

- click 時間戳 → `videoEl.currentTime = note.timestampSec`

### 8.6 SPA 換影片

- 監聽 `yt-navigate-finish` + URL 變化
- 偵測到新 videoId → 重新載入該影片的筆記到面板
- 若有未保存的編輯狀態 → 提示是否保留

### 8.7 多分頁

- 每個分頁的 content script 獨立運作
- chrome.storage 寫入用 videoId 為 key，不會打架
- chrome.storage.onChanged 廣播：其他分頁若開著同 video，自動同步

## 9. 邊角情境

| 情境 | 處理 |
|---|---|
| 影片標題含禁字 | sanitize（§6.3） |
| Windows 保留檔名 | 前綴 `_` |
| 截圖時影片捲出 viewport | `scrollIntoView` + 100ms wait |
| 截圖時播的是 YouTube 廣告 | V1 不偵測，截到廣告就截到。README 說明此限制 |
| YouTube SPA 切換影片 | §8.6 |
| 同時開多個 YouTube 分頁 | §8.7 |
| FSA 權限過期 | 匯出時 `requestPermission` user gesture 內靜默 re-prompt |
| Vault 資料夾被使用者刪除/移動 | 寫入時 catch error → 提示重新選擇 vault |
| 同名資料夾已存在且含使用者其他檔案 | 只覆寫 `note.md` + `assets/` 內我們會用的檔，不動其他檔案；匯出前無確認對話框（V1 接受） |
| chrome.storage 配額爆 | 顯示原始錯誤訊息（5MB 對純文字筆記極少達到） |
| IndexedDB 配額爆 | 顯示錯誤訊息；壓縮快取功能留 V1.5 |
| 影片是會員/付費限定載入失敗 | 偵測不到 video 元素就不顯示面板 |
| 編輯中切換分頁 | 編輯狀態保留在記憶體；切到別支影片才丟掉並提示 |

## 10. 權限

`manifest.json` 必要權限：

- `activeTab` + `tabs`：`captureVisibleTab` 截圖
- `storage`：chrome.storage.local
- `host_permissions`: `https://www.youtube.com/*`
- `commands`: 宣告 `Alt+N` 切換面板

不需要：

- File System Access API：用瀏覽器原生 picker，無 manifest 權限
- 任何外部網域 host_permissions

## 11. 技術選型

| 面向 | 選擇 |
|---|---|
| UI Framework | Preact (~3KB) + JSX |
| Build | Vite + vite-plugin-web-extension |
| 樣式 | CSS variables（theme tokens）+ CSS modules 或 vanilla CSS |
| State | Preact signals 或 useState（component-scoped） |
| Storage 抽象 | 直接呼叫 chrome.storage；IndexedDB 透過 `idb` (~1KB) |
| 套件管理 | 用 npm CLI 安裝最新版本，不手寫 package.json 版本號 |
| TypeScript | 是（提早設好型別比較不會踩雷） |
| 測試 | Vitest（unit）+ Playwright（E2E，跑在真實 Chrome） |

## 12. 不在 V1 範圍（明確排除）

- 逐字稿擷取、引用、AI 改寫
- 雲端同步、跨裝置同步
- 自動匯出、匯出排程
- 截圖編輯（標註、裁切調整）
- 標籤、搜尋、跨影片串連
- Shorts、直播、嵌入頁支援
- 廣告偵測（截到廣告畫面是已知限制）
- 匯出前列出檔案差異的確認對話框
- IndexedDB 壓縮快取功能

## 13. 後續版本草圖（不在 V1）

- **V1.5**：匯出前差異確認；IndexedDB 壓縮快取；面板上「在 Options 匯出」捷徑
- **V2**：逐字稿擷取與引用；自動暫停可關
- **V3**：AI 摘要 / 改寫輔助
