# JigFinder · 拼圖碎片定位工具

拍攝手上的單一拼圖碎片，透過影像辨識找出它屬於完成圖（大圖）的哪個位置。
**純前端**、不上傳任何影像，並可透過 GitHub Actions 自動發佈到 GitHub Pages。

> 完整規格請見 [`Spec.md`](./Spec.md)。

## 功能

- 📥 設定拼圖大圖（完成圖），以 IndexedDB 保存，重開仍在。
- 📷 開啟相機、中央對位框引導取景，拍攝單一碎片。
- 🧩 以 OpenCV.js（ORB 特徵 + 單應性矩陣）比對，定位碎片在大圖中的位置。
- 🎯 結果在大圖上以方框／標記點呈現，附信心度與估計旋轉角度，並可放大檢視。
- 🖼️ 相機不可用時，可改從相簿上傳碎片照。

## 技術棧

- Vanilla JavaScript（ES Modules）+ [Vite](https://vitejs.dev/)
- [OpenCV.js](https://docs.opencv.org/)（WebAssembly，預設由 CDN 載入）
- IndexedDB、MediaDevices `getUserMedia`

## 本機開發

```bash
npm install
npm run dev      # 啟動開發伺服器
npm run build    # 產出 dist/
npm run preview  # 預覽 build 結果
```

> 相機需在 HTTPS 或 `localhost` 下才能使用。`npm run dev` 的 `localhost` 即可。

## 部署到 GitHub Pages

1. 將程式推送 / 合併到 `main` 分支。
2. 於 GitHub repo：**Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
3. `.github/workflows/deploy.yml` 會自動建置並發佈。
4. 發佈網址：`https://mark19891107.github.io/JigFinder/`。

## 使用建議

- 大圖請使用清晰、完整的完成圖。
- 拍碎片時讓碎片填滿對位框、保持清晰、避免反光與陰影。
- 大片純色或重複紋理（天空、草地）特徵少，可能定位失敗 —— 系統會提示重拍。

## 可調參數

辨識相關參數集中於 [`src/state.js`](./src/state.js) 的 `CONFIG`，可依拼圖特性調整。

## 隱私

所有運算都在瀏覽器內完成；相機影像與大圖僅存於使用者裝置（記憶體 / IndexedDB），不會上傳到任何伺服器。
