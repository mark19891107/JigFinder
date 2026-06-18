// 載入並初始化 OpenCV.js（WebAssembly 版）。
// 預設由 CDN 載入；若要改為內嵌，將 opencv.js 放到 public/ 並改成 './opencv.js'。
const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';

let loadPromise = null;

export function loadOpenCV() {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const ready = () => window.cv && typeof window.cv.Mat === 'function';

    if (ready()) {
      resolve(window.cv);
      return;
    }

    const script = document.createElement('script');
    script.src = OPENCV_URL;
    script.async = true;

    const settle = () => {
      // 新版可能把 cv 暴露為 Promise（非同步 WASM 模組）
      if (window.cv && typeof window.cv.then === 'function') {
        window.cv.then((c) => {
          window.cv = c;
          resolve(c);
        }).catch(reject);
        return true;
      }
      if (ready()) {
        resolve(window.cv);
        return true;
      }
      return false;
    };

    script.onload = () => {
      if (settle()) return;
      // 傳統建置：WASM 仍在初始化，輪詢直到 runtime 就緒
      let waited = 0;
      const timer = setInterval(() => {
        if (settle()) {
          clearInterval(timer);
          return;
        }
        waited += 50;
        if (waited > 30000) {
          clearInterval(timer);
          reject(new Error('OpenCV.js 初始化逾時'));
        }
      }, 50);
    };

    script.onerror = () => reject(new Error('OpenCV.js 載入失敗（請檢查網路連線）'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
