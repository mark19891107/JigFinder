// 載入並初始化 OpenCV.js（WebAssembly 版），由外部 CDN 提供。
// 採多來源後備：第一個來源失敗（網路/404）時自動換下一個，提升穩定度。
//
// 注意：部分 OpenCV.js build（如 @techstark）的 cv 是 emscripten「thenable 模組」，
// 其 then(cb) 會在 runtime 就緒時呼叫 cb(module)，但「不回傳 Promise」。
// 因此不可寫成 cv.then(...).catch(...)；resolve 前也需移除 then，避免 Promise 重複展開。
const OPENCV_URLS = [
  'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.12.0-release.1/dist/opencv.js',
  'https://docs.opencv.org/4.x/opencv.js',
];

let loadPromise = null;

export function loadOpenCV() {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    let settled = false;
    const overall = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('OpenCV.js 載入逾時，請檢查網路後重試'));
      }
    }, 60000);

    const done = (cv) => {
      if (settled) return;
      settled = true;
      clearTimeout(overall);
      resolve(cv);
    };

    // 嘗試取得已就緒的 cv（同時支援 thenable 模組與傳統 build）
    const grab = () => {
      const cv = window.cv;
      if (cv && typeof cv.then === 'function') {
        cv.then((ready) => {
          // emscripten 模組本身是 thenable，移除 then 以免被 Promise 重複展開
          try {
            delete ready.then;
          } catch (_) {
            ready.then = undefined;
          }
          done(ready);
        });
        return true;
      }
      if (cv && typeof cv.Mat === 'function') {
        done(cv);
        return true;
      }
      return false;
    };

    const tryLoad = (i) => {
      if (i >= OPENCV_URLS.length) {
        if (!settled) {
          settled = true;
          clearTimeout(overall);
          reject(new Error('OpenCV.js 載入失敗（所有來源都無法取得，請檢查網路）'));
        }
        return;
      }
      const script = document.createElement('script');
      script.src = OPENCV_URLS[i];
      script.async = true;
      script.onload = () => {
        if (grab()) return;
        // 傳統 build 仍在初始化：輪詢直到就緒（整體逾時負責保底）
        const timer = setInterval(() => {
          if (settled || grab()) clearInterval(timer);
        }, 50);
      };
      script.onerror = () => {
        script.remove();
        tryLoad(i + 1); // 換下一個來源
      };
      document.head.appendChild(script);
    };

    if (!grab()) tryLoad(0);
  });

  return loadPromise;
}
