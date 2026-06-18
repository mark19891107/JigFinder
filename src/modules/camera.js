// 相機控制：開關、切換鏡頭、擷取中央對位框內影像。
let activeStream = null;

export async function startCamera(videoEl, facing = 'environment') {
  stopCamera();
  activeStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });
  videoEl.srcObject = activeStream;
  videoEl.setAttribute('playsinline', ''); // iOS Safari 需要才能內嵌播放
  await videoEl.play();
  return activeStream;
}

export function stopCamera() {
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
  }
}

// 是否有多顆鏡頭（可切換）
export async function hasMultipleCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput').length > 1;
  } catch {
    return false;
  }
}

// 擷取畫面中央的正方形區域（邊長 = cropRatio × 短邊）。
// 與畫面上「正方形取景框 + 70% 對位框 + object-fit:cover」的呈現一致。
export function captureCrop(videoEl, cropRatio) {
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  if (!vw || !vh) return null;

  const side = Math.floor(Math.min(vw, vh) * cropRatio);
  const sx = Math.floor((vw - side) / 2);
  const sy = Math.floor((vh - side) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, sx, sy, side, side, 0, 0, side, side);
  return canvas;
}
