import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const proxy = {
  '/api/route': 'http://127.0.0.1:8787',
  '/api/amap': 'http://127.0.0.1:8787',
  '/_AMapService': 'http://127.0.0.1:8787',
};

export default defineConfig({
  base: './',
  server: {
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/militia-deployment.local.*'],
    },
    proxy,
  },
  preview: { proxy },
  optimizeDeps: { entries: ['index.html'] },
  plugins: [
    vue(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/cesium/Build/Cesium/Workers', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/Assets', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/ThirdParty', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/Widgets', dest: 'cesium' },
        { src: 'web-data/data', dest: '.' },
      ],
    }),
  ],
  build: {
    outDir: 'web-dist',
    rollupOptions: {
      input: { main: 'index.html', terrainLab: 'amap-terrain-lab.html' },
      output: { manualChunks: { cesium: ['cesium'] } },
    },
    chunkSizeWarningLimit: 5000,
  },
});
