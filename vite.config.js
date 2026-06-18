import { defineConfig } from 'vite';

// 使用相對路徑 base，確保部署在 GitHub Pages 子路徑
// (https://<user>.github.io/JigFinder/) 下，資源仍能正確載入。
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
