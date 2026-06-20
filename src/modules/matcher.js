// 核心比對：碎片特徵 vs. 大圖特徵 → 找出位置、角度與信心度。
// 針對重複紋理（如馬賽克拼圖）：先用「廣義 Hough 投票」找出幾何一致的落點尖峰，
// 再只對尖峰的支持配對做單應性，避免被大量隨機配對淹沒。
import { CONFIG } from '../state.js';

const HOUGH_DIV = 45; // Hough 投票網格密度（沿長邊切幾格）

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
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    area += c[i].x * c[j].y - c[j].x * c[i].y;
  }
  area = Math.abs(area) / 2;
  const refArea = refW * refH;
  if (area < refArea * 0.0002 || area > refArea * 1.25) return false;

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

// 廣義 Hough：用每個配對的尺度(size)+方向(angle)預測「碎片中心」在大圖的落點並投票。
// 正確配對會在同一處堆出尖峰；錯誤配對四散 → 大幅提升重複紋理的定位力。
function houghLocalize(matches, refW, refH) {
  const cellSize = Math.max(refW, refH) / HOUGH_DIV;
  const buckets = new Map();
  for (const m of matches) {
    // 預測落點需落在大圖範圍附近（容許些許溢出）
    if (m.px < -0.25 * refW || m.px > 1.25 * refW || m.py < -0.25 * refH || m.py > 1.25 * refH) {
      continue;
    }
    const key = Math.round(m.px / cellSize) + ',' + Math.round(m.py / cellSize);
    let b = buckets.get(key);
    if (!b) {
      b = { sx: 0, sy: 0, votes: 0 };
      buckets.set(key, b);
    }
    b.sx += m.px;
    b.sy += m.py;
    b.votes++;
  }

  const ranked = [...buckets.values()]
    .map((b) => ({ x: b.sx / b.votes, y: b.sy / b.votes, votes: b.votes }))
    .sort((a, b) => b.votes - a.votes);

  // 非極大抑制（避免相鄰格重複）
  const kept = [];
  for (const c of ranked) {
    if (kept.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < cellSize * 1.5)) continue;
    kept.push(c);
    if (kept.length >= CONFIG.MAX_CANDIDATES) break;
  }
  return { cells: kept, cellSize };
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
    candidates: [],
    homography: null,
    piecePts: 0,
    refPts: 0,
    peakVotes: 0,
  };
}

// piece / reference: { keypoints, descriptors, width, height }
export function matchPiece(cv, piece, reference) {
  const result = emptyResult();
  result.piecePts = piece.keypoints ? piece.keypoints.size() : 0;
  result.refPts = reference.keypoints ? reference.keypoints.size() : 0;

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

    // Lowe's ratio test + 紀錄每個配對的幾何（含預測的碎片中心落點）
    const cxp = piece.width / 2;
    const cyp = piece.height / 2;
    const matches = [];
    for (let i = 0; i < knn.size(); i++) {
      const pair = knn.get(i);
      if (pair.size() < 2) continue;
      const m = pair.get(0);
      const n = pair.get(1);
      if (m.distance < CONFIG.RATIO_TEST * n.distance) {
        const pk = piece.keypoints.get(m.queryIdx);
        const rk = reference.keypoints.get(m.trainIdx);
        const ps = pk.size || 1;
        const scale = (rk.size || 1) / ps;
        const dAng = (((rk.angle || 0) - (pk.angle || 0)) * Math.PI) / 180;
        const cosA = Math.cos(dAng);
        const sinA = Math.sin(dAng);
        const vx = cxp - pk.pt.x;
        const vy = cyp - pk.pt.y;
        matches.push({
          sx: pk.pt.x,
          sy: pk.pt.y,
          dx: rk.pt.x,
          dy: rk.pt.y,
          px: rk.pt.x + scale * (cosA * vx - sinA * vy),
          py: rk.pt.y + scale * (sinA * vx + cosA * vy),
        });
      }
    }
    result.goodMatches = matches.length;
    if (matches.length < CONFIG.MIN_GOOD_MATCHES) return result;

    // Hough 投票找落點尖峰（即使單應性失敗，也作為「最可能區域」候選）
    const { cells, cellSize } = houghLocalize(matches, reference.width, reference.height);
    result.candidates = cells.map((c) => ({ x: c.x, y: c.y, votes: c.votes }));
    if (!cells.length) return result;
    const peak = cells[0];
    result.peakVotes = peak.votes;

    // 蒐集尖峰附近、幾何一致的支持配對，只對它們做單應性
    const radius = cellSize * 2;
    const support = matches.filter((m) => Math.hypot(m.px - peak.x, m.py - peak.y) <= radius);
    if (support.length < 4) return result;

    const srcArr = [];
    const dstArr = [];
    for (const m of support) {
      srcArr.push(m.sx, m.sy);
      dstArr.push(m.dx, m.dy);
    }
    srcPts = cv.matFromArray(support.length, 1, cv.CV_32FC2, srcArr);
    dstPts = cv.matFromArray(support.length, 1, cv.CV_32FC2, dstArr);
    mask = new cv.Mat();
    H = cv.findHomography(srcPts, dstPts, cv.RANSAC, CONFIG.RANSAC_REPROJ, mask);
    if (!H || H.empty()) return result;

    let inliers = 0;
    for (let i = 0; i < mask.rows; i++) {
      if (mask.data[i]) inliers++;
    }
    result.inliers = inliers;
    if (inliers < CONFIG.MIN_INLIERS) return result;

    // 投影碎片四角到大圖座標
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

    result.homography = Array.from(H.data64F);
    result.center = {
      x: (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
      y: (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
    };
    result.corners = corners;
    result.angle = (Math.atan2(H.data64F[3], H.data64F[0]) * 180) / Math.PI;
    result.found = true;
    result.confidence = Math.min(100, Math.round((inliers / 30) * 100));
    result.level = inliers >= 20 ? 'high' : inliers >= 12 ? 'mid' : 'low';
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
