# CLAUDE.md

此檔提供給 Claude Code 在本專案工作時的指引。

## 溝通慣例（重要）

- **一律使用繁體中文與使用者溝通、回報進度。**
- 每個工作階段結束時，用中文清楚說明：做了什麼、結果如何、下一步建議。
- 遇到卡關（例如權限、網路政策）時，明確說明原因與使用者可採取的解法。

## 專案簡介

JigFinder 是純前端的拼圖碎片定位工具：使用者先設定拼圖完成圖（大圖），再用相機拍攝單一碎片，
透過 OpenCV.js（ORB 特徵 + 單應性矩陣）找出碎片在大圖中的位置。完整規格見 `Spec.md`。

## 常用指令

```bash
npm install        # 安裝相依套件（postinstall 會把 OpenCV.js 複製到 public/）
npm run dev        # 本機開發伺服器（相機在 localhost 可用）
npm run build      # 產出 dist/
npm run preview    # 預覽 build 結果
npm run vendor:opencv  # 強制重新複製 public/opencv.js
```

## 架構重點

- 無框架，Vanilla JS + Vite；`vite.config.js` 的 `base: './'` 以相容 GitHub Pages 子路徑。
- 程式進入點 `src/main.js`（狀態機 + 事件），畫面在 `src/modules/ui.js`。
- 影像辨識核心：`src/modules/features.js`（ORB 特徵）、`src/modules/matcher.js`（比對/定位/信心度/候選）、
  `src/modules/overlay.js`（碎片半透明疊合的透視變形）。
- 大圖以 IndexedDB 保存：`src/modules/storage.js`；相機：`src/modules/camera.js`。
- 可調參數集中在 `src/state.js` 的 `CONFIG`。

## OpenCV.js 來源

由 npm 套件 `@techstark/opencv-js` 提供，透過 `scripts/vendor-opencv.mjs`（postinstall）複製到
`public/opencv.js`（已 gitignore，CI 安裝時自動產生）。執行時由本站自身載入，不依賴外部 CDN。

## 部署

推送到 `main` 會觸發 `.github/workflows/deploy.yml` 自動建置並發佈到 GitHub Pages
（`https://mark19891107.github.io/JigFinder/`）。需在 repo Settings → Pages → Source 選 GitHub Actions。

## 開發注意

- OpenCV 的 `cv.Mat` 等物件需手動 `.delete()` 釋放，避免 WASM 記憶體洩漏；辨識流程都用 `try/finally`。
- 相機需在 HTTPS 或 localhost 才能使用。
