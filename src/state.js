// 全域可調參數（集中管理，方便調校辨識行為）
export const CONFIG = {
  REFERENCE_MAX_SIDE: 3000, // 大圖長邊上限（馬賽克/密集圖樣需高解析才能對到磚塊細節）
  PIECE_MAX_SIDE: 1000,     // 碎片長邊上限
  ORB_FEATURES_REF: 15000,  // 大圖 ORB 特徵點數（高解析需大量特徵）
  ORB_FEATURES_PIECE: 3000, // 碎片 ORB 特徵點數
  RATIO_TEST: 0.78,         // Lowe's ratio test 門檻（越高越寬鬆）
  MIN_GOOD_MATCHES: 8,      // 進入幾何驗證的最低「好配對」數
  MIN_INLIERS: 7,           // 判定成功的最低內點數
  RANSAC_REPROJ: 5.0,       // RANSAC 重投影誤差容忍 (px)
  CROP_RATIO: 0.7,          // 中央對位框佔取景方框的比例
  ZOOM_LEVEL: 2.5,          // 結果頁放大檢視倍率
  // Top-N 候選位置（依配對特徵點的分佈群聚投票）
  CANDIDATE_GRID: 16,       // 投票網格密度（沿長邊切幾格）
  MAX_CANDIDATES: 5,        // 最多回傳幾個候選
  MIN_CANDIDATE_VOTES: 3,   // 候選的最低票數
  OVERLAY_ALPHA: 0.55,      // 半透明疊合碎片的透明度
};

// 預設值快照（供「恢復預設」使用）
export const DEFAULTS = { ...CONFIG };

// 使用者可在 App 內即時調整的辨識參數（會保存到 localStorage）。
// group: 'match' 比對門檻（即時生效）；'image' 影像解析度/特徵量。
// recompute: true 表示改動後需重算大圖特徵才會套用（按設定面板的「重算大圖特徵」）。
export const TUNABLE = [
  {
    key: 'RATIO_TEST',
    group: 'match',
    label: '比對寬鬆度 (ratio)',
    min: 0.5,
    max: 0.95,
    step: 0.01,
    hint: '越高越寬鬆：保留更多特徵配對（太高容易誤判）',
  },
  {
    key: 'MIN_GOOD_MATCHES',
    group: 'match',
    label: '最少配對數',
    min: 4,
    max: 40,
    step: 1,
    hint: '低於此數直接判定找不到；越低越容易嘗試定位',
  },
  {
    key: 'MIN_INLIERS',
    group: 'match',
    label: '判定成功的最少內點數',
    min: 3,
    max: 40,
    step: 1,
    hint: '最終門檻；越低越容易「找到」（太低會誤標位置）',
  },
  {
    key: 'PIECE_MAX_SIDE',
    group: 'image',
    label: '碎片解析度上限 (px)',
    min: 600,
    max: 2000,
    step: 100,
    hint: '越高越能保留碎片細節（下次掃描即生效）',
  },
  {
    key: 'ORB_FEATURES_PIECE',
    group: 'image',
    label: '碎片特徵點數',
    min: 1000,
    max: 8000,
    step: 500,
    hint: '越多越穩但越慢（下次掃描即生效）',
  },
  {
    key: 'REFERENCE_MAX_SIDE',
    group: 'image',
    recompute: true,
    label: '大圖解析度上限 (px)',
    min: 1600,
    max: 6000,
    step: 200,
    hint: '馬賽克拼圖請調高；需上傳高解析大圖並按「重算大圖特徵」',
  },
  {
    key: 'ORB_FEATURES_REF',
    group: 'image',
    recompute: true,
    label: '大圖特徵點數',
    min: 3000,
    max: 40000,
    step: 1000,
    hint: '高解析需更多特徵；改動後按「重算大圖特徵」',
  },
];

const SETTINGS_KEY = 'jigfinder.settings';

// 啟動時載入使用者設定，覆蓋 CONFIG 預設值。
export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    for (const f of TUNABLE) {
      const v = saved[f.key];
      if (typeof v === 'number' && isFinite(v)) {
        CONFIG[f.key] = Math.min(f.max, Math.max(f.min, v));
      }
    }
  } catch (_) {
    /* 忽略損壞的設定 */
  }
}

// 將目前可調門檻保存到 localStorage。
export function saveSettings() {
  const cur = {};
  for (const f of TUNABLE) cur[f.key] = CONFIG[f.key];
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(cur));
  } catch (_) {
    /* localStorage 不可用時略過 */
  }
}

// 恢復預設並清除保存的設定。
export function resetSettings() {
  for (const f of TUNABLE) CONFIG[f.key] = DEFAULTS[f.key];
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch (_) {
    /* 略過 */
  }
}

// 應用程式狀態
export const state = {
  view: 'LOADING', // LOADING | SETUP | READY | CAMERA | ANALYZING | RESULT | SETTINGS | ERROR
  puzzle: null,    // { blob, width, height, bitmap }
  reference: null, // { keypoints, descriptors, width, height }（OpenCV Mat，記憶體快取）
  lastResult: null, // 最近一次比對結果
  cameraFacing: 'environment',
  error: '',
};
