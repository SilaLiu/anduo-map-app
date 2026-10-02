import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: './',
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
    rollupOptions: { output: { manualChunks: { cesium: ['cesium'] } } },
    chunkSizeWarningLimit: 5000,
  },
});
