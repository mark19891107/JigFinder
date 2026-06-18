// 將 @techstark/opencv-js 的 prebuilt opencv.js 複製到 public/，
// 讓 OpenCV.js 由本站自身提供（不依賴外部 CDN）。
// 由 package.json 的 postinstall 自動執行；加 --force 可覆寫既有檔案。
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'node_modules/@techstark/opencv-js/dist/opencv.js');
const destDir = resolve(root, 'public');
const dest = resolve(destDir, 'opencv.js');
const force = process.argv.includes('--force');

if (!existsSync(src)) {
  console.warn('[vendor-opencv] 找不到來源 opencv.js（@techstark/opencv-js 未安裝？），略過。');
  process.exit(0);
}
if (existsSync(dest) && !force) {
  console.log('[vendor-opencv] public/opencv.js 已存在，略過（--force 可覆寫）。');
  process.exit(0);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('[vendor-opencv] 已複製 opencv.js 到 public/opencv.js');
