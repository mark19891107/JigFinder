// 載入並初始化 OpenCV.js（WebAssembly 版），由外部 CDN 提供。
// 採多來源後備：第一個來源失敗（網路/404）時自動換下一個，提升穩定度。
const OPENCV_URLS = [
  'https://docs.opencv.org/4.10.0/opencv.js',
  'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.12.0-release.1/dist/opencv.js',
];

let loadPromise = null;

export function loadOpenCV() {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const ready = () => window.cv && typeof window.cv.Mat === 'function';

    if (ready()) {
      resolve(window.cv);
      return;
    }

    // 嘗試讓 cv 就緒：支援 Promise 版與傳統（onRuntimeInitialized）版
    const settle = () => {
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

    let waited = 0;
    const startPolling = () => {
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

    const tryLoad = (i) => {
      if (i >= OPENCV_URLS.length) {
        reject(new Error('OpenCV.js 載入失敗（所有來源都無法取得，請檢查網路）'));
        return;
      }
      const script = document.createElement('script');
      script.src = OPENCV_URLS[i];
      script.async = true;
      script.onload = () => {
        if (!settle()) startPolling(); // WASM 仍在初始化，開始輪詢
      };
      script.onerror = () => {
        script.remove();
        tryLoad(i + 1); // 換下一個來源
      };
      document.head.appendChild(script);
    };

    tryLoad(0);
  });

  return loadPromise;
}
