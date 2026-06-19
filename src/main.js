import './style.css';
import { CONFIG, state, loadSettings, resetSettings } from './state.js';
import { loadOpenCV } from './modules/opencv.js';
import { savePuzzle, loadPuzzle } from './modules/storage.js';
import { startCamera, stopCamera, captureCrop } from './modules/camera.js';
import { toScaledCanvas, detectFeatures, releaseFeatures } from './modules/features.js';
import { matchPiece } from './modules/matcher.js';
import { buildOverlayCanvas } from './modules/overlay.js';
import * as ui from './modules/ui.js';

let cv = null;

// 讓瀏覽器有機會先把畫面畫出來，再執行同步的重運算。
const tick = () => new Promise((r) => setTimeout(r, 30));

function setView(view) {
  state.view = view;
  render();
}

function render() {
  switch (state.view) {
    case 'LOADING':
      ui.renderLoading();
      break;
    case 'SETUP':
      ui.renderSetup(handlers);
      break;
    case 'READY':
      ui.renderReady(state, handlers);
      break;
    case 'CAMERA':
      ui.renderCamera(handlers);
      break;
    case 'ANALYZING':
      ui.renderAnalyzing();
      break;
    case 'RESULT':
      ui.renderResult(state, handlers);
      break;
    case 'SETTINGS':
      ui.renderSettings(handlers);
      break;
    case 'ERROR':
      ui.renderError(state.error, handlers);
      break;
  }
}

// 計算並快取大圖特徵（先釋放舊的，避免 WASM 記憶體洩漏）。
function computeReference(bitmap) {
  if (state.reference) {
    releaseFeatures(state.reference);
    state.reference = null;
  }
  const canvas = toScaledCanvas(bitmap, CONFIG.REFERENCE_MAX_SIDE);
  state.reference = detectFeatures(cv, canvas, CONFIG.ORB_FEATURES_REF);
}

// 對一張碎片影像（canvas）執行辨識並進入結果頁。
async function analyze(sourceCanvas) {
  setView('ANALYZING');
  await tick();

  let piece = null;
  try {
    const scaled = toScaledCanvas(sourceCanvas, CONFIG.PIECE_MAX_SIDE);
    piece = detectFeatures(cv, scaled, CONFIG.ORB_FEATURES_PIECE);
    const result = matchPiece(cv, piece, state.reference);

    // 辨識成功時，預先做出碎片半透明疊合圖層（供結果頁切換顯示）
    if (result.found && result.homography) {
      try {
        result.overlayCanvas = buildOverlayCanvas(
          cv,
          scaled,
          result.homography,
          state.reference.width,
          state.reference.height
        );
      } catch (e) {
        console.error('建立疊合圖層失敗', e);
        result.overlayCanvas = null;
      }
    }
    state.lastResult = result;
  } catch (err) {
    console.error(err);
    state.lastResult = null;
  } finally {
    releaseFeatures(piece);
  }
  setView('RESULT');
}

async function fileToBitmap(file) {
  return await createImageBitmap(file);
}

// ---- 使用者操作 --------------------------------------------------------

const handlers = {
  async onPickPuzzle(file) {
    ui.renderLoading('正在處理大圖…');
    try {
      const bitmap = await fileToBitmap(file);
      await savePuzzle({
        blob: file,
        width: bitmap.width,
        height: bitmap.height,
        createdAt: Date.now(),
      });
      state.puzzle = { blob: file, width: bitmap.width, height: bitmap.height, bitmap };
      ui.renderLoading('正在分析大圖特徵…');
      await tick();
      computeReference(bitmap);
      setView('READY');
    } catch (err) {
      console.error(err);
      state.error = '無法讀取這張圖片，請換一張再試。';
      setView('ERROR');
    }
  },

  async onScan() {
    setView('CAMERA');
    const video = document.getElementById('cam');
    try {
      await startCamera(video, state.cameraFacing);
    } catch (err) {
      console.error(err);
      const note = document.getElementById('cam-error');
      if (note) note.textContent = '無法開啟相機（權限被拒或不支援），請改用下方「從相簿選擇」。';
    }
  },

  onShoot() {
    const video = document.getElementById('cam');
    const crop = captureCrop(video, CONFIG.CROP_RATIO);
    if (!crop) return;
    stopCamera();
    analyze(crop);
  },

  async onUploadPiece(file) {
    try {
      const bitmap = await fileToBitmap(file);
      stopCamera();
      analyze(toScaledCanvas(bitmap, CONFIG.PIECE_MAX_SIDE));
    } catch (err) {
      console.error(err);
    }
  },

  async onFlip() {
    state.cameraFacing = state.cameraFacing === 'environment' ? 'user' : 'environment';
    const video = document.getElementById('cam');
    try {
      await startCamera(video, state.cameraFacing);
    } catch (err) {
      console.error(err);
    }
  },

  onBack() {
    stopCamera();
    setView('READY');
  },

  onRescan() {
    handlers.onScan();
  },

  onChangePuzzle() {
    stopCamera();
    setView('SETUP');
  },

  onOpenSettings() {
    stopCamera();
    setView('SETTINGS');
  },

  onCloseSettings() {
    setView(state.puzzle ? 'READY' : 'SETUP');
  },

  onResetSettings() {
    resetSettings();
    setView('SETTINGS'); // 重繪以更新滑桿數值
  },

  async onRecomputeReference() {
    if (!state.puzzle) {
      setView('SETTINGS');
      return;
    }
    ui.renderLoading('正在以新解析度重算大圖特徵…（可能需數秒）');
    await tick();
    try {
      computeReference(state.puzzle.bitmap);
    } catch (err) {
      console.error(err);
    }
    setView('SETTINGS');
  },

  onReload() {
    window.location.reload();
  },
};

// ---- 啟動 --------------------------------------------------------------

async function init() {
  loadSettings(); // 套用使用者保存的辨識門檻
  render(); // LOADING

  try {
    cv = await loadOpenCV();
  } catch (err) {
    console.error(err);
    state.error = 'OpenCV.js 載入失敗，請確認網路連線後重新載入。';
    setView('ERROR');
    return;
  }

  try {
    const record = await loadPuzzle();
    if (record && record.blob) {
      const bitmap = await fileToBitmap(record.blob);
      state.puzzle = { ...record, bitmap };
      ui.renderLoading('正在分析大圖特徵…');
      await tick();
      computeReference(bitmap);
      setView('READY');
    } else {
      setView('SETUP');
    }
  } catch (err) {
    console.error(err);
    setView('SETUP');
  }
}

init();
