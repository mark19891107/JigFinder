// 畫面渲染層：依狀態繪製各畫面，並把使用者操作轉交給 handlers。
import { CONFIG } from '../state.js';

const app = () => document.getElementById('app');
let objectUrl = null; // 目前大圖縮圖的 ObjectURL，於每次渲染前釋放

function setApp(html) {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  app().innerHTML = html;
}

function shell(title, body) {
  return `
    <header class="topbar"><h1>JigFinder</h1><span class="subtitle">${title}</span></header>
    <main class="content">${body}</main>
  `;
}

// ---- 各畫面 -------------------------------------------------------------

export function renderLoading(msg = '正在載入影像辨識引擎…') {
  setApp(
    shell(
      '請稍候',
      `<div class="center-card">
         <div class="spinner"></div>
         <p class="muted">${msg}</p>
       </div>`
    )
  );
}

export function renderError(msg, handlers) {
  setApp(
    shell(
      '發生問題',
      `<div class="center-card">
         <p class="error-text">⚠️ ${msg}</p>
         <button class="btn primary" id="retry">重新載入</button>
       </div>`
    )
  );
  document.getElementById('retry').addEventListener('click', () => handlers.onReload());
}

export function renderSetup(handlers) {
  setApp(
    shell(
      '設定拼圖大圖',
      `<div class="center-card">
         <p class="muted">先選擇拼圖的「完成圖」，之後就能拍攝碎片來定位。</p>
         <label class="btn primary block">
           選擇大圖
           <input type="file" id="puzzle-input" accept="image/*" hidden />
         </label>
         <p class="hint">圖片只會留在這台裝置上，不會上傳。</p>
       </div>`
    )
  );
  document.getElementById('puzzle-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handlers.onPickPuzzle(file);
  });
}

export function renderReady(state, handlers) {
  objectUrl = URL.createObjectURL(state.puzzle.blob);
  setApp(
    shell(
      '已就緒',
      `<div class="center-card">
         <div class="thumb-wrap"><img class="thumb" src="${objectUrl}" alt="拼圖大圖" /></div>
         <p class="muted">${state.puzzle.width} × ${state.puzzle.height}px</p>
         <button class="btn primary block" id="scan">📷 掃描碎片</button>
         <button class="btn ghost block" id="change">更換大圖</button>
       </div>`
    )
  );
  document.getElementById('scan').addEventListener('click', () => handlers.onScan());
  document.getElementById('change').addEventListener('click', () => handlers.onChangePuzzle());
}

export function renderCamera(handlers) {
  setApp(
    shell(
      '對準碎片',
      `<div class="cam-stage">
         <div class="cam-viewport">
           <video id="cam" playsinline muted></video>
           <div class="cam-guide"></div>
         </div>
         <p class="cam-hint">把碎片對齊綠框內，盡量填滿、保持清晰</p>
         <p class="cam-error" id="cam-error"></p>
         <div class="cam-controls">
           <button class="btn ghost" id="back">返回</button>
           <button class="shutter" id="shoot" aria-label="拍照"></button>
           <button class="btn ghost" id="flip">切換鏡頭</button>
         </div>
         <label class="btn ghost block">
           從相簿選擇碎片照
           <input type="file" id="piece-input" accept="image/*" hidden />
         </label>
       </div>`
    )
  );
  document.getElementById('shoot').addEventListener('click', () => handlers.onShoot());
  document.getElementById('back').addEventListener('click', () => handlers.onBack());
  document.getElementById('flip').addEventListener('click', () => handlers.onFlip());
  document.getElementById('piece-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handlers.onUploadPiece(file);
  });
}

export function renderAnalyzing() {
  setApp(
    shell(
      '辨識中',
      `<div class="center-card">
         <div class="spinner"></div>
         <p class="muted">正在比對特徵、定位碎片…</p>
       </div>`
    )
  );
}

export function renderResult(state, handlers) {
  const r = state.lastResult;
  let zoom = 1;

  if (!r || !r.found) {
    setApp(
      shell(
        '找不到',
        `<div class="center-card">
           <p class="error-text">😕 找不到符合的位置</p>
           <p class="muted">可能原因：碎片紋理太少、模糊、反光，或未對準框內。請重拍一次。</p>
           <button class="btn primary block" id="rescan">重新拍攝</button>
           <button class="btn ghost block" id="change">更換大圖</button>
         </div>`
      )
    );
    document.getElementById('rescan').addEventListener('click', () => handlers.onRescan());
    document.getElementById('change').addEventListener('click', () => handlers.onChangePuzzle());
    return;
  }

  const levelMap = {
    high: { text: '高', cls: 'lv-high' },
    mid: { text: '中', cls: 'lv-mid' },
    low: { text: '低', cls: 'lv-low' },
  };
  const lv = levelMap[r.level] || levelMap.low;
  const angle = Math.round(((r.angle % 360) + 540) % 360 - 180);

  setApp(
    shell(
      '定位結果',
      `<div class="result-stage">
         <div class="canvas-wrap"><canvas id="result-canvas"></canvas></div>
         <div class="result-meta">
           <span class="badge ${lv.cls}">信心度：${lv.text}・${r.confidence}%</span>
           <span class="badge">內點 ${r.inliers}</span>
           <span class="badge">旋轉約 ${angle}°</span>
         </div>
         <div class="result-actions">
           <button class="btn ghost" id="zoom">🔍 放大檢視</button>
           <button class="btn primary" id="rescan">再掃一片</button>
         </div>
         <button class="btn ghost block" id="change">更換大圖</button>
       </div>`
    )
  );

  const canvas = document.getElementById('result-canvas');
  const redraw = () =>
    requestAnimationFrame(() => drawMatch(canvas, state.puzzle.bitmap, state.reference, r, zoom));
  redraw();
  window.addEventListener('resize', redraw, { once: true });

  document.getElementById('zoom').addEventListener('click', (e) => {
    zoom = zoom === 1 ? CONFIG.ZOOM_LEVEL : 1;
    e.currentTarget.textContent = zoom === 1 ? '🔍 放大檢視' : '↩︎ 還原檢視';
    redraw();
  });
  document.getElementById('rescan').addEventListener('click', () => handlers.onRescan());
  document.getElementById('change').addEventListener('click', () => handlers.onChangePuzzle());
}

// ---- 結果繪製 ----------------------------------------------------------

// bitmap：原始大圖；reference：特徵空間尺寸（縮放後），result.corners/center 以此為基準。
function drawMatch(canvas, bitmap, reference, result, zoom = 1) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.parentElement.clientWidth || 360;
  const aspect = bitmap.height / bitmap.width;
  const cssH = Math.round(cssW * aspect);

  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 以 match 中心為焦點計算來源裁切區（zoom=1 即整張）
  const cx = (result.center.x / reference.width) * bitmap.width;
  const cy = (result.center.y / reference.height) * bitmap.height;
  const srcW = bitmap.width / zoom;
  const srcH = bitmap.height / zoom;
  let sx = cx - srcW / 2;
  let sy = cy - srcH / 2;
  sx = Math.max(0, Math.min(bitmap.width - srcW, sx));
  sy = Math.max(0, Math.min(bitmap.height - srcH, sy));

  ctx.clearRect(0, 0, cssW, cssH);
  ctx.drawImage(bitmap, sx, sy, srcW, srcH, 0, 0, cssW, cssH);

  // 特徵空間座標 → 畫布座標
  const mapX = (x) => (((x / reference.width) * bitmap.width - sx) / srcW) * cssW;
  const mapY = (y) => (((y / reference.height) * bitmap.height - sy) / srcH) * cssH;

  // 四邊形
  const c = result.corners;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(74, 222, 128, 0.95)';
  ctx.fillStyle = 'rgba(74, 222, 128, 0.18)';
  ctx.beginPath();
  ctx.moveTo(mapX(c[0].x), mapY(c[0].y));
  for (let i = 1; i < 4; i++) ctx.lineTo(mapX(c[i].x), mapY(c[i].y));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 中心標記
  ctx.beginPath();
  ctx.arc(mapX(result.center.x), mapY(result.center.y), 8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(248, 113, 113, 0.95)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
}
