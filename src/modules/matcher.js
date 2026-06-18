// 核心比對：碎片特徵 vs. 大圖特徵 → 找出位置、角度與信心度。
import { CONFIG } from '../state.js';

// 建立 BFMatcher（ORB 為二進位描述子，需用 Hamming 距離）。
function createBF(cv) {
  const attempts = [
    () => new cv.BFMatcher(cv.NORM_HAMMING, false),
    () => new cv.BFMatcher(cv.NORM_HAMMING),
    () => new cv.BFMatcher(),
  ];
  for (const make of attempts) {
    try {
      return make();
    } catch (_) {
      /* 試下一個多載 */
    }
  }
  throw new Error('無法建立比對器');
}

// 檢查投影出的四邊形是否合理（凸多邊形、面積在合理範圍）。
function isReasonableQuad(c, refW, refH) {
  // Shoelace 面積
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += c[i].x * c[j].y - c[j].x * c[i].y;
  }
  area = Math.abs(area) / 2;
  const refArea = refW * refH;
  if (area < refArea * 0.0004 || area > refArea * 1.25) return false;

  // 凸性：相鄰邊外積同號
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = c[i];
    const b = c[(i + 1) % 4];
    const d = c[(i + 2) % 4];
    const cross = (b.x - a.x) * (d.y - b.y) - (b.y - a.y) * (d.x - b.x);
    const s = Math.sign(cross);
    if (s !== 0) {
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

function emptyResult() {
  return {
    found: false,
    confidence: 0,
    inliers: 0,
    goodMatches: 0,
    center: null,
    corners: null,
    angle: 0,
    level: 'none',
  };
}

// piece / reference: { keypoints, descriptors, width, height }
export function matchPiece(cv, piece, reference) {
  const result = emptyResult();

  if (
    !piece.descriptors || piece.descriptors.rows < 2 ||
    !reference.descriptors || reference.descriptors.rows < 2
  ) {
    return result;
  }

  const bf = createBF(cv);
  const knn = new cv.DMatchVectorVector();
  let srcPts, dstPts, mask, H;

  try {
    bf.knnMatch(piece.descriptors, reference.descriptors, knn, 2);

    // Lowe's ratio test
    const srcArr = [];
    const dstArr = [];
    let good = 0;
    for (let i = 0; i < knn.size(); i++) {
      const pair = knn.get(i);
      if (pair.size() < 2) continue;
      const m = pair.get(0);
      const n = pair.get(1);
      if (m.distance < CONFIG.RATIO_TEST * n.distance) {
        const pk = piece.keypoints.get(m.queryIdx).pt;
        const rk = reference.keypoints.get(m.trainIdx).pt;
        srcArr.push(pk.x, pk.y);
        dstArr.push(rk.x, rk.y);
        good++;
      }
    }
    result.goodMatches = good;
    if (good < CONFIG.MIN_GOOD_MATCHES) return result;

    srcPts = cv.matFromArray(good, 1, cv.CV_32FC2, srcArr);
    dstPts = cv.matFromArray(good, 1, cv.CV_32FC2, dstArr);
    mask = new cv.Mat();
    H = cv.findHomography(srcPts, dstPts, cv.RANSAC, CONFIG.RANSAC_REPROJ, mask);

    if (!H || H.empty()) return result;

    let inliers = 0;
    for (let i = 0; i < mask.rows; i++) {
      if (mask.data[i]) inliers++;
    }
    result.inliers = inliers;
    if (inliers < CONFIG.MIN_INLIERS) return result;

    // 把碎片影像四角投影到大圖座標
    const w = piece.width;
    const h = piece.height;
    const cornersSrc = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, w, 0, w, h, 0, h]);
    const cornersDst = new cv.Mat();
    cv.perspectiveTransform(cornersSrc, cornersDst, H);
    const corners = [];
    for (let i = 0; i < 4; i++) {
      corners.push({ x: cornersDst.data32F[i * 2], y: cornersDst.data32F[i * 2 + 1] });
    }
    cornersSrc.delete();
    cornersDst.delete();

    if (!isReasonableQuad(corners, reference.width, reference.height)) return result;

    const center = {
      x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
      y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
    };
    // 由 H 的旋轉分量估計角度
    const angle = (Math.atan2(H.data64F[3], H.data64F[0]) * 180) / Math.PI;

    result.found = true;
    result.center = center;
    result.corners = corners;
    result.angle = angle;
    result.confidence = Math.min(100, Math.round((inliers / 40) * 100));
    result.level = inliers >= 25 ? 'high' : inliers >= 15 ? 'mid' : 'low';
    return result;
  } finally {
    bf.delete();
    knn.delete();
    srcPts?.delete();
    dstPts?.delete();
    mask?.delete();
    H?.delete();
  }
}
