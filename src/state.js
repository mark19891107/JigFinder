// 全域可調參數（集中管理，方便調校辨識行為）
export const CONFIG = {
  REFERENCE_MAX_SIDE: 1600, // 大圖長邊上限（計算特徵前縮放）
  PIECE_MAX_SIDE: 800,      // 碎片長邊上限
  ORB_FEATURES_REF: 3000,   // 大圖 ORB 特徵點數
  ORB_FEATURES_PIECE: 1000, // 碎片 ORB 特徵點數
  RATIO_TEST: 0.75,         // Lowe's ratio test 門檻
  MIN_GOOD_MATCHES: 12,     // 進入幾何驗證的最低「好配對」數
  MIN_INLIERS: 10,          // 判定成功的最低內點數
  RANSAC_REPROJ: 5.0,       // RANSAC 重投影誤差容忍 (px)
  CROP_RATIO: 0.7,          // 中央對位框佔取景方框的比例
  ZOOM_LEVEL: 2.5,          // 結果頁放大檢視倍率
};

// 應用程式狀態
export const state = {
  view: 'LOADING',     // LOADING | SETUP | READY | CAMERA | ANALYZING | RESULT | ERROR
  puzzle: null,        // { blob, width, height, bitmap }
  reference: null,     // { keypoints, descriptors, width, height }（OpenCV Mat，記憶體快取）
  lastResult: null,    // 最近一次比對結果
  cameraFacing: 'environment',
  error: '',
};
