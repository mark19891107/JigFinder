// 載入並初始化 OpenCV.js（WebAssembly 版）。
// 由本站自身提供（public/opencv.js，來源見 scripts/vendor-opencv.mjs），不依賴外部 CDN。
// 以 document.baseURI 解析，確保 GitHub Pages 子路徑與本機開發都能正確載入。
const OPENCV_URL = new URL('opencv.js', document.baseURI).href;

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
