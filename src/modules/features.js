// 影像前處理與 ORB 特徵擷取。
import { CONFIG } from '../state.js';

// 將來源（ImageBitmap / Image / Canvas）等比例縮放到長邊不超過 maxSide，回傳 canvas。
export function toScaledCanvas(source, maxSide) {
  const w = source.width || source.videoWidth;
  const h = source.height || source.videoHeight;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0, cw, ch);
  return canvas;
}

// 建立 ORB 偵測器，容忍不同 OpenCV.js 建置的建構子多載差異。
function createORB(cv, nfeatures) {
  const attempts = [
    () => new cv.ORB(nfeatures, 1.2, 8, 31, 0, 2, 0, 31, 20),
    () => new cv.ORB(nfeatures),
    () => new cv.ORB(),
  ];
  for (const make of attempts) {
    try {
      return make();
    } catch (_) {
      /* 試下一個多載 */
    }
  }
  throw new Error('無法建立 ORB 偵測器');
}

// 偵測特徵點與描述子。回傳 { keypoints, descriptors, width, height }。
// 注意：回傳的 keypoints / descriptors 是 OpenCV Mat 物件，使用完需呼叫 .delete()。
export function detectFeatures(cv, canvas, nfeatures) {
  const src = cv.imread(canvas); // RGBA
  const gray = new cv.Mat();
  const noMask = new cv.Mat();
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  let orb;
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    orb = createORB(cv, nfeatures);
    orb.detectAndCompute(gray, noMask, keypoints, descriptors);
  } finally {
    src.delete();
    gray.delete();
    noMask.delete();
    if (orb) orb.delete();
  }
  return { keypoints, descriptors, width: canvas.width, height: canvas.height };
}

// 釋放 detectFeatures 回傳的 Mat。
export function releaseFeatures(features) {
  if (!features) return;
  try {
    features.keypoints?.delete();
    features.descriptors?.delete();
  } catch (_) {
    /* 已釋放 */
  }
}
