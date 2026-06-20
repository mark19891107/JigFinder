// 畫面渲染層：依狀態繪製各畫面，並把使用者操作轉交給 handlers。
import { CONFIG, TUNABLE, saveSettings } from '../state.js';

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
  // 先 setApp（會 revoke 前一個 objectUrl 並清空），再建立新縮圖 URL 指派給 <img>，
  // 避免剛建立的 blob URL 立刻被 setApp revoke 掉而 ERR_FILE_NOT_FOUND。
  setApp(
    shell(
      '已就緒',
      `<div class="center-card">
         <div class="thumb-wrap"><img class="thumb" id="puzzle-thumb" alt="拼圖大圖" /></div>
         <p class="muted">${state.puzzle.width} × ${state.puzzle.height}px</p>
         <button class="btn primary block" id="scan">📷 掃描碎片</button>
         <button class="btn ghost block" id="settings">⚙️ 辨識設定</button>
         <button class="btn ghost block" id="change">更換大圖</button>
       </div>`
    )
  );
  objectUrl = URL.createObjectURL(state.puzzle.blob);
  const thumb = document.getElementById('puzzle-thumb');
  if (thumb) thumb.src = objectUrl;
  document.getElementById('scan').addEventListener('click', () => handlers.onScan());
  document.getElementById('settings').addEventListener('click', () => handlers.onOpenSettings());
  document.getElementById('change').addEventListener('click', () => handlers.onChangePuzzle());
}

export function renderSettings(handlers) {
  const fieldHtml = (f) => {
    const val = CONFIG[f.key];
    return `
      <div class="setting">
        <label class="setting-label" for="rng-${f.key}">
          ${f.label} <span class="setting-val" id="val-${f.key}">${val}</span>
        </label>
        <input class="setting-range" type="range" id="rng-${f.key}"
               min="${f.min}" max="${f.max}" step="${f.step}" value="${val}" />
        <p class="setting-hint">${f.hint}</p>
      </div>`;
  };
  const matchFields = TUNABLE.filter((f) => f.group === 'match').map(fieldHtml).join('');
  const imageFields = TUNABLE.filter((f) => f.group === 'image').map(fieldHtml).join('');

  setApp(
    shell(
      '辨識設定',
      `<div class="settings-stage">
         <p class="muted">「找不到」太頻繁時：先把<strong>內點數 / 配對數</strong>調低、<strong>寬鬆度</strong>調高。若是<strong>馬賽克／密集圖樣</strong>拼圖，請把<strong>大圖解析度</strong>調高，並上傳高解析大圖。</p>

         <h3 class="settings-h">比對門檻（即時生效）</h3>
         ${matchFields}

         <h3 class="settings-h">影像解析度 / 特徵量</h3>
         ${imageFields}
         <button class="btn primary block" id="recompute">🔄 重算大圖特徵（套用大圖解析度）</button>

         <div class="settings-foot">
           <button class="btn ghost block" id="reset">恢復預設值</button>
           <button class="btn ghost block" id="back">← 返回</button>
         </div>
       </div>`
    )
  );

  TUNABLE.forEach((f) => {
    const rng = document.getElementById('rng-' + f.key);
    const out = document.getElementById('val-' + f.key);
    if (!rng) return;
    rng.addEventListener('input', () => {
      const v = f.step < 1 ? parseFloat(rng.value) : parseInt(rng.value, 10);
      CONFIG[f.key] = v;
      out.textContent = v;
      saveSettings();
    });
  });
  document.getElementById('recompute').addEventListener('click', () => handlers.onRecomputeReference());
  document.getElementById('reset').addEventListener('click', () => handlers.onResetSettings());
  document.getElementById('back').addEventListener('click', () => handlers.onCloseSettings());
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

// 依診斷數字給出對症建議
function diagHint(d) {
  if (!d || !d.piecePts) {
    return '碎片幾乎沒有偵測到特徵：請對焦、讓碎片填滿綠框、避免反光與晃動後重拍。';
  }
  if ((d.goodMatches || 0) < CONFIG.MIN_GOOD_MATCHES) {
    return '好配對太少（馬賽克／重複紋理常見）：到「⚙️ 調整靈敏度」把「比對寬鬆度」拉到 0.88–0.92、「最少配對數」調低再試。';
  }
  return '配對足夠但幾何驗證未過：把「最少內點數」調低（如 5），或開啟「📍 候選位置」參考。';
}

export function renderResult(state, handlers) {
  const r = state.lastResult;
  const view = { zoom: 1, showCandidates: false, showOverlay: false };

  // 精準定位失敗，但有候選叢集 → 改顯示「最可能區域」（對馬賽克/重複紋理較實用）
  if (r && !r.found && r.candidates && r.candidates.length) {
    renderApprox(state, handlers, r);
    return;
  }

  if (!r || !r.found) {
    const d = r || {};
    setApp(
      shell(
        '找不到',
        `<div class="center-card">
           <p class="error-text">😕 找不到符合的位置</p>
           <div class="result-meta">
             <span class="badge">大圖特徵 ${d.refPts || 0}</span>
             <span class="badge">碎片特徵 ${d.piecePts || 0}</span>
             <span class="badge">配對 ${d.goodMatches || 0}</span>
             <span class="badge">內點 ${d.inliers || 0}</span>
           </div>
           <p class="muted">${diagHint(d)}</p>
           <button class="btn primary block" id="rescan">重新拍攝</button>
           <button class="btn ghost block" id="settings">⚙️ 調整靈敏度</button>
           <button class="btn ghost block" id="change">更換大圖</button>
         </div>`
      )
    );
    document.getElementById('rescan').addEventListener('click', () => handlers.onRescan());
    document.getElementById('settings').addEventListener('click', () => handlers.onOpenSettings());
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
  const candCount = r.candidates ? r.candidates.length : 0;

  setApp(
    shell(
      '定位結果',
      `<div class="result-stage">
         <div class="canvas-wrap"><canvas id="result-canvas"></canvas></div>
         <div class="result-meta">
           <span class="badge ${lv.cls}">信心度：${lv.text}・${r.confidence}%</span>
           <span class="badge">配對 ${r.goodMatches}</span>
           <span class="badge">內點 ${r.inliers}</span>
           <span class="badge">旋轉約 ${angle}°</span>
         </div>
         <div class="result-toggles">
           <button class="btn ghost" id="zoom">🔍 放大</button>
           ${r.overlayCanvas ? '<button class="btn ghost" id="overlay">🧩 疊合碎片</button>' : ''}
           ${candCount > 1 ? `<button class="btn ghost" id="candidates">📍 候選 ${candCount}</button>` : ''}
         </div>
         <div class="result-actions">
           <button class="btn primary block" id="rescan">再掃一片</button>
         </div>
         <button class="btn ghost block" id="change">更換大圖</button>
       </div>`
    )
  );

  const canvas = document.getElementById('result-canvas');
  const redraw = () =>
    requestAnimationFrame(() =>
      drawMatch(canvas, state.puzzle.bitmap, state.reference, r, view)
    );
  redraw();
  window.addEventListener('resize', redraw, { once: true });

  document.getElementById('zoom').addEventListener('click', (e) => {
    view.zoom = view.zoom === 1 ? CONFIG.ZOOM_LEVEL : 1;
    e.currentTarget.classList.toggle('active', view.zoom !== 1);
    e.currentTarget.textContent = view.zoom === 1 ? '🔍 放大' : '↩︎ 還原';
    redraw();
  });

  const bindToggle = (id, key, onText, offText) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      view[key] = !view[key];
      btn.classList.toggle('active', view[key]);
      btn.textContent = view[key] ? onText : offText;
      redraw();
    });
  };
  bindToggle('overlay', 'showOverlay', '🧩 隱藏疊合', '🧩 疊合碎片');
  bindToggle('candidates', 'showCandidates', '📍 隱藏候選', `📍 候選 ${candCount}`);

  document.getElementById('rescan').addEventListener('click', () => handlers.onRescan());
  document.getElementById('change').addEventListener('click', () => handlers.onChangePuzzle());
}

// 精準定位失敗時的「最可能區域」畫面（配對密度熱點）
function renderApprox(state, handlers, r) {
  setApp(
    shell(
      '最可能區域',
      `<div class="result-stage">
         <p class="muted">⚠️ 重複紋理無法精準定位。以下是配對最密集的「可能區域」，數字為可能性排序（① 最可能）。</p>
         <div class="canvas-wrap"><canvas id="approx-canvas"></canvas></div>
         <div class="result-meta">
           <span class="badge">配對 ${r.goodMatches}</span>
           <span class="badge">候選 ${r.candidates.length}</span>
           <span class="badge">① ${r.candidates[0].votes} 票</span>
         </div>
         <div class="result-actions">
           <button class="btn primary block" id="rescan">再掃一片</button>
         </div>
         <button class="btn ghost block" id="settings">⚙️ 調整靈敏度</button>
         <button class="btn ghost block" id="change">更換大圖</button>
       </div>`
    )
  );
  const canvas = document.getElementById('approx-canvas');
  const redraw = () =>
    requestAnimationFrame(() => drawApprox(canvas, state.puzzle.bitmap, state.reference, r.candidates));
  redraw();
  window.addEventListener('resize', redraw, { once: true });
  document.getElementById('rescan').addEventListener('click', () => handlers.onRescan());
  document.getElementById('settings').addEventListener('click', () => handlers.onOpenSettings());
  document.getElementById('change').addEventListener('click', () => handlers.onChangePuzzle());
}

// 畫整張大圖 + 候選熱點（依票數大小、① 為最可能、綠色強調）
function drawApprox(canvas, bitmap, reference, candidates) {
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
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.drawImage(bitmap, 0, 0, cssW, cssH);

  const sx = cssW / reference.width;
  const sy = cssH / reference.height;
  const maxVotes = candidates[0] ? candidates[0].votes : 1;

  candidates.forEach((c, i) => {
    const x = c.x * sx;
    const y = c.y * sy;
    const rad = 12 + 20 * (c.votes / maxVotes);
    const top = i === 0;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fillStyle = top ? 'rgba(74, 222, 128, 0.30)' : 'rgba(96, 165, 250, 0.22)';
    ctx.fill();
    ctx.lineWidth = top ? 4 : 2;
    ctx.strokeStyle = top ? 'rgba(74, 222, 128, 0.95)' : 'rgba(96, 165, 250, 0.9)';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y);
  });
}

// ---- 結果繪製 ----------------------------------------------------------

// bitmap：原始大圖；reference：特徵空間尺寸（縮放後），result.corners/center 以此為基準。
// view: { zoom, showCandidates, showOverlay }
function drawMatch(canvas, bitmap, reference, result, view = {}) {
  const zoom = view.zoom || 1;
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

  // 半透明疊合碎片（overlayCanvas 為大圖特徵空間尺寸，需對齊目前裁切視窗）
  if (view.showOverlay && result.overlayCanvas) {
    const oc = result.overlayCanvas;
    const osx = (sx / bitmap.width) * oc.width;
    const osy = (sy / bitmap.height) * oc.height;
    const osw = (srcW / bitmap.width) * oc.width;
    const osh = (srcH / bitmap.height) * oc.height;
    ctx.save();
    ctx.globalAlpha = CONFIG.OVERLAY_ALPHA;
    ctx.drawImage(oc, osx, osy, osw, osh, 0, 0, cssW, cssH);
    ctx.restore();
  }

  // 特徵空間座標 → 畫布座標
  const mapX = (x) => (((x / reference.width) * bitmap.width - sx) / srcW) * cssW;
  const mapY = (y) => (((y / reference.height) * bitmap.height - sy) / srcH) * cssH;

  // Top-N 候選位置（次要藍色標記）
  if (view.showCandidates && result.candidates) {
    result.candidates.forEach((cand, i) => {
      const x = mapX(cand.x);
      const y = mapY(cand.y);
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(96, 165, 250, 0.85)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, y);
    });
  }

  // 最佳位置四邊形
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
