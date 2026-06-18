# JigFinder 拼圖碎片定位工具 — 規格書 (Spec)

> 一個純前端的拼圖輔助工具：先設定拼圖「大圖（完成圖）」，再用相機拍攝手上的單一拼圖碎片，
> 透過影像辨識找出這個碎片屬於大圖的哪個位置。專案以 GitHub Actions 自動發佈到 GitHub Pages。

---

## 1. 專案概述

### 1.1 目標
協助拼圖玩家在面對成百上千片拼圖時，快速判斷「手上這片」應該放在完成圖的哪個區域，
減少肉眼比對的時間。

### 1.2 核心價值
- **純前端、零後端**：所有運算（含影像辨識）都在使用者瀏覽器內完成。
- **隱私安全**：相機影像、拼圖大圖都不上傳，全程留在裝置端。
- **免安裝**：開啟網頁即可用，行動裝置優先（Mobile-first）。
- **自動部署**：推送到 `main` 後由 GitHub Actions 建置並發佈到 GitHub Pages。

### 1.3 範圍 (Scope)
| 包含 (In Scope) | 不包含 (Out of Scope) |
| --- | --- |
| 設定 / 更換大圖 | 多人協作、雲端同步 |
| 相機即時取景 + 對位框 | 自動辨識整盒拼圖、進度追蹤 |
| 單一碎片定位（含角度估計） | 拼圖自動拼合、AR 即時疊合 |
| 結果標記 + 信心度 | 帳號系統、登入 |
| 相簿上傳碎片照（相機備援） | 原生 App |

---

## 2. 名詞定義

| 名詞 | 說明 |
| --- | --- |
| **大圖 / 完成圖 (Reference Image)** | 拼圖盒上的完整圖案，作為比對的母體。 |
| **碎片 (Piece)** | 使用者手上的單一拼圖塊。 |
| **特徵點 (Keypoint)** | 影像中可重複辨識的顯著點（角、邊緣交會處等）。 |
| **描述子 (Descriptor)** | 描述特徵點周圍紋理的向量，用於比對。本專案使用 ORB（二進位描述子）。 |
| **單應性矩陣 (Homography)** | 描述碎片影像與大圖之間的平面投影轉換，用來把碎片定位回大圖座標。 |
| **內點 (Inlier)** | 通過 RANSAC 幾何驗證、彼此一致的配對點，數量是信心度的主要依據。 |

---

## 3. 使用者流程 (User Flow)

```
┌──────────┐  載入 OpenCV.js   ┌──────────┐
│  Loading  │ ───────────────▶ │  判斷狀態  │
└──────────┘                   └────┬─────┘
                                    │
                  尚未設定大圖 ◀────┴────▶ 已有大圖
                       │                      │
                       ▼                      ▼
                 ┌──────────┐          ┌──────────┐
                 │  Setup    │          │  Ready    │
                 │ 上傳大圖   │ ───────▶ │ 顯示大圖   │
                 └──────────┘          │ +「掃描碎片」│
                                       └────┬─────┘
                                            │ 點擊掃描
                                            ▼
                                       ┌──────────┐
                                       │  Camera   │
                                       │ 對位框取景  │
                                       └────┬─────┘
                                            │ 拍照
                                            ▼
                                       ┌──────────┐    信心不足
                                       │ Analyzing │ ───────────▶ 提示重拍
                                       └────┬─────┘
                                            │ 成功
                                            ▼
                                       ┌──────────┐
                                       │  Result   │ ─── 再掃一片 ──▶ Camera
                                       │ 標記+信心度 │ ─── 換大圖 ───▶ Setup
                                       └──────────┘
```

### 3.1 主要情境
1. **首次使用**：開啟網頁 → 上傳拼圖大圖 → 系統預先計算大圖特徵 → 進入 Ready。
2. **定位碎片**：點「掃描碎片」→ 對準中央對位框 → 拍照 → 等待辨識 → 看到大圖上標記出的位置與信心度。
3. **連續定位**：在結果頁點「再掃一片」可立即回到相機，大圖特徵已快取、不需重算。
4. **更換拼圖**：點「更換大圖」回到 Setup，重設後重新計算特徵。

---

## 4. 功能需求 (Functional Requirements)

### FR-1 大圖設定
- FR-1.1 支援從裝置選擇圖片檔（JPG / PNG / WEBP）作為大圖。
- FR-1.2 上傳後顯示縮圖預覽，並可重新更換。
- FR-1.3 大圖持久化儲存於 **IndexedDB**，重新整理或下次開啟仍保留。
- FR-1.4 過大的大圖在計算特徵前先等比例縮放（長邊上限預設 **1600px**），兼顧準確度與效能。

### FR-2 相機取景
- FR-2.1 透過 `getUserMedia` 開啟相機，行動裝置預設使用後鏡頭（`facingMode: "environment"`）。
- FR-2.2 取景畫面中央顯示**正方形對位框**，引導使用者把碎片對齊框內。
- FR-2.3 提供「拍照」按鈕；拍照時只擷取對位框內的影像送辨識。
- FR-2.4 相機無法使用（不支援 / 權限被拒）時，自動提供**從相簿上傳碎片照**的備援路徑。
- FR-2.5 可切換前後鏡頭（若裝置有多顆鏡頭）。

### FR-3 碎片辨識（核心）
- FR-3.1 對擷取的碎片影像計算 ORB 特徵點與描述子。
- FR-3.2 與大圖描述子進行比對（BFMatcher + KNN + Lowe's ratio test）。
- FR-3.3 用 `findHomography`（RANSAC）做幾何驗證，求得碎片在大圖中的位置與角度。
- FR-3.4 以**內點數量**為主計算信心度，低於門檻時判定為「找不到」。
- FR-3.5 辨識全程在 Web 端完成，過程顯示載入 / 分析中的狀態。

### FR-4 結果呈現
- FR-4.1 在大圖上以**方框 / 標記點**標出最相符的位置（含碎片估計外框四邊形）。
- FR-4.2 顯示**信心度**（百分比 + 高/中/低分級）。
- FR-4.3 顯示估計的**旋轉角度**（碎片相對大圖的方向）。
- FR-4.4 信心度過低時，提示「找不到，請對準框內 / 確保光線充足後重拍」。
- FR-4.5 結果頁支援**放大檢視**標記區域，並提供「再掃一片」「更換大圖」。

### FR-5 狀態與提示
- FR-5.1 OpenCV.js 載入期間顯示 Loading 畫面（含進度提示）。
- FR-5.2 各種錯誤（相機、檔案、辨識失敗）以明確訊息呈現，並提供下一步操作。

---

## 5. 非功能需求 (Non-Functional Requirements)

| 類別 | 需求 |
| --- | --- |
| **效能** | 大圖特徵僅在設定 / 載入時計算一次並快取於記憶體；單片辨識在中階手機應 < 1.5 秒。 |
| **相容性** | 支援近兩年主流瀏覽器（Chrome / Safari / Edge / Firefox）；相機需 HTTPS（GitHub Pages 原生支援）。 |
| **隱私** | 不傳送任何影像到伺服器；相機串流、大圖僅存於使用者裝置（IndexedDB / 記憶體）。 |
| **可用性** | Mobile-first 響應式設計；單手可操作；主要操作按鈕大且明確。 |
| **可維護性** | 模組化（相機 / 辨識 / 儲存 / UI 分離），純 JS、無重型框架。 |
| **可離線** | 首次載入後，除 OpenCV.js（預設 CDN）外，核心功能可離線運作（可選擇將 OpenCV.js 內嵌）。 |

---

## 6. 技術架構

### 6.1 技術棧
- **建置工具**：Vite（產出靜態檔，部署到 GitHub Pages）。
- **語言**：原生 JavaScript（ES Modules）+ HTML + CSS，無前端框架。
- **影像辨識**：OpenCV.js（WebAssembly 版），預設由 CDN（jsDelivr）載入；可改為內嵌至 `public/`。
- **儲存**：IndexedDB（存大圖 Blob 與中繼資料）。
- **相機**：MediaDevices `getUserMedia` API。

> Vite `base` 採相對路徑 `'./'`，確保部署在 `https://<user>.github.io/JigFinder/` 子路徑下資源仍能正確載入。

### 6.2 模組劃分
```
src/
├── main.js              # 進入點：初始化、狀態機、事件綁定
├── state.js            # 全域狀態（目前畫面、大圖、特徵快取、最近結果）
├── style.css           # 樣式（mobile-first）
└── modules/
    ├── opencv.js       # 載入並初始化 OpenCV.js（回傳 ready 的 Promise）
    ├── storage.js      # IndexedDB：存 / 取 / 清除大圖
    ├── camera.js       # 開關相機、切換鏡頭、擷取對位框影像
    ├── features.js     # ORB 特徵擷取、影像縮放、Mat 工具
    ├── matcher.js      # 比對 + Homography + 信心度計算
    └── ui.js           # 各畫面 render、結果繪製（canvas overlay）
```

### 6.3 資料流
```
大圖檔案 ──▶ storage(IndexedDB) ──▶ features.detect() ──▶ 大圖特徵(記憶體快取)
                                                                │
相機/相簿 ──▶ camera.capture(對位框) ──▶ features.detect() ──┐  │
                                                            ▼  ▼
                                              matcher.match(piece, reference)
                                                            │
                                                            ▼
                                          { found, center, corners, angle, confidence }
                                                            │
                                                            ▼
                                              ui.renderResult(大圖 + 標記)
```

---

## 7. 辨識演算法細節

### 7.1 流程
1. **前處理**：碎片與大圖皆轉灰階；大圖長邊縮至 ≤ 1600px、碎片長邊縮至 ≤ 800px。
2. **特徵擷取**：`cv.ORB`（大圖 `nfeatures≈3000`，碎片 `nfeatures≈1000`），取得 keypoints + 描述子。
3. **比對**：`cv.BFMatcher(cv.NORM_HAMMING)` 的 `knnMatch(k=2)`。
4. **比值測試 (Lowe's ratio test)**：保留 `m.distance < 0.75 * n.distance` 的「好配對」。
5. **幾何驗證**：好配對 ≥ `MIN_GOOD_MATCHES`(預設 12) 時，以 `cv.findHomography(srcPts, dstPts, cv.RANSAC, 5.0)` 求單應性矩陣與內點遮罩。
6. **定位**：將碎片影像四角經 H 投影到大圖座標，得到四邊形 → 計算中心點與外接矩形。
7. **角度估計**：由 H 的旋轉分量推算碎片相對大圖的旋轉角度。
8. **合理性檢查**：四邊形需為凸、面積合理（非退化、不過小 / 過大）。

### 7.2 信心度
- 主依據：**內點數 (inliers)**。
- 顯示分級：
  - `inliers ≥ 25` → **高**
  - `15 ≤ inliers < 25` → **中**
  - `MIN_INLIERS(預設 10) ≤ inliers < 15` → **低**
  - `inliers < MIN_INLIERS` 或單應性不合理 → **找不到**（提示重拍）。
- 百分比為輔助顯示：`min(100, round(inliers / 40 * 100))`（可調）。

### 7.3 可調參數（集中於設定常數）
| 參數 | 預設 | 說明 |
| --- | --- | --- |
| `REFERENCE_MAX_SIDE` | 1600 | 大圖長邊上限 |
| `PIECE_MAX_SIDE` | 800 | 碎片長邊上限 |
| `ORB_FEATURES_REF` | 3000 | 大圖特徵點數 |
| `ORB_FEATURES_PIECE` | 1000 | 碎片特徵點數 |
| `RATIO_TEST` | 0.75 | Lowe's ratio |
| `MIN_GOOD_MATCHES` | 12 | 進入幾何驗證門檻 |
| `MIN_INLIERS` | 10 | 判定成功的最低內點數 |
| `RANSAC_REPROJ` | 5.0 | RANSAC 重投影誤差容忍 |
| `CROP_RATIO` | 0.7 | 對位框佔取景方框比例 |

### 7.4 已知限制
- **重複 / 低紋理區域**（如大片純色天空、規則格紋）特徵點少，定位易失敗或誤判 → 以信心度提示重拍。
- 強烈反光、模糊、嚴重透視變形會降低成功率。
- 此法回報「碎片圖案對應大圖的哪個區域」，非實體拼圖格位編號。

### 7.5 記憶體管理
OpenCV.js 的 `cv.Mat` / `cv.KeyPointVector` / `cv.DMatchVector` 等物件需手動 `.delete()`，
所有辨識流程以 `try/finally` 確保釋放，避免 WASM heap 洩漏。

---

## 8. 資料儲存 (IndexedDB)

- DB 名稱：`jigfinder`，物件倉儲：`puzzle`。
- 紀錄：`{ id: "current", blob, width, height, createdAt }`。
- 大圖特徵（keypoints / descriptors）為 `cv.Mat`，**不序列化儲存**，於每次載入後重新計算並快取於記憶體（單張耗時短、且避免序列化複雜度與版本相容問題）。

---

## 9. UI / 畫面狀態機

| 狀態 | 畫面內容 | 可用操作 |
| --- | --- | --- |
| `LOADING` | OpenCV.js 載入提示 | — |
| `SETUP` | 上傳大圖區、說明 | 選擇圖片 |
| `READY` | 大圖縮圖、狀態列 | 掃描碎片、更換大圖 |
| `CAMERA` | 即時取景 + 中央對位框 + 快門 | 拍照、切換鏡頭、相簿上傳、返回 |
| `ANALYZING` | 分析中動畫 | — |
| `RESULT` | 大圖 + 位置標記 + 信心度 + 角度 | 放大、再掃一片、更換大圖 |

設計準則：Mobile-first、深色背景突顯影像、主要 CTA 置於拇指可及範圍。

---

## 10. 專案結構

```
JigFinder/
├── index.html
├── package.json
├── vite.config.js
├── .github/
│   └── workflows/
│       └── deploy.yml         # 建置 + 發佈 GitHub Pages
├── public/
│   └── (可選) opencv.js        # 若選擇內嵌而非 CDN
├── src/
│   ├── main.js
│   ├── state.js
│   ├── style.css
│   └── modules/
│       ├── opencv.js
│       ├── storage.js
│       ├── camera.js
│       ├── features.js
│       ├── matcher.js
│       └── ui.js
├── Spec.md
└── README.md
```

---

## 11. 部署 (GitHub Actions → GitHub Pages)

- 觸發：推送到 `main`（或手動 `workflow_dispatch`）。
- 步驟：`checkout → setup-node → npm ci → npm run build → upload-pages-artifact → deploy-pages`。
- 權限：`pages: write`、`id-token: write`。
- 發佈網址：`https://mark19891107.github.io/JigFinder/`。
- 需於 GitHub repo「Settings → Pages → Build and deployment → Source」選擇 **GitHub Actions**。

> 注意：目前開發於 `claude/determined-goodall-lkxa8n` 分支；**合併到 `main` 後**才會觸發部署。

---

## 12. 開發里程碑

| 階段 | 內容 | 產出 |
| --- | --- | --- |
| M0 | 規格確認 | 本 Spec.md |
| M1 | 專案骨架 + Vite + Pages workflow | 可建置、可部署的空殼 |
| M2 | OpenCV.js 載入 + 大圖上傳 + IndexedDB | 可設定並保存大圖 |
| M3 | 相機取景 + 對位框 + 擷取 | 可拍出碎片影像 |
| M4 | ORB 比對 + Homography + 信心度 | 可定位碎片 |
| M5 | 結果標記 + 角度 + 放大 + 錯誤處理 | 完整可用流程 |
| M6 | 樣式打磨、參數調校、README | 發佈版本 |

---

## 13. 未來擴充（非本期）
- 多碎片批次辨識、定位歷史紀錄。
- 半透明 AR 疊合即時預覽。
- 重複紋理拼圖的 Top-N 候選清單。
- 將 OpenCV.js 內嵌並加上 Service Worker，達成完整離線 PWA。
- 大圖可由 URL / 相機直接拍攝盒面取得。

---

## 14. 驗收標準 (Acceptance Criteria)
- [ ] 可上傳大圖並在重新整理後保留。
- [ ] 行動裝置可開啟相機並看到中央對位框。
- [ ] 對準清晰、具紋理的碎片拍照後，能在大圖上標出正確區域且信心度為中以上。
- [ ] 找不到時有明確重拍提示，不會誤標高信心。
- [ ] 相機被拒時可改用相簿上傳完成辨識。
- [ ] `npm run build` 成功，GitHub Actions 能將成品發佈到 GitHub Pages。
