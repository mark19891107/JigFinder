// 用單應性矩陣把碎片影像透視變形到大圖座標，產生一張「碎片落點」的透明圖層，
// 供結果頁做半透明疊合。回傳一個與大圖特徵空間同尺寸（refW × refH）的 canvas。
export function buildOverlayCanvas(cv, pieceCanvas, homography, refW, refH) {
  const src = cv.imread(pieceCanvas); // RGBA
  const H = cv.matFromArray(3, 3, cv.CV_64F, homography);
  const dst = new cv.Mat();
  try {
    const dsize = new cv.Size(refW, refH);
    // 邊界以全透明填滿，碎片以外的區域才不會蓋住大圖
    cv.warpPerspective(
      src,
      dst,
      H,
      dsize,
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(0, 0, 0, 0)
    );
    const out = document.createElement('canvas');
    out.width = refW;
    out.height = refH;
    cv.imshow(out, dst);
    return out;
  } finally {
    src.delete();
    H.delete();
    dst.delete();
  }
}
