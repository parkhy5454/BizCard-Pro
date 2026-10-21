import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@techstark/opencv-js'],
    exclude: []
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'opencv': ['@techstark/opencv-js']
        }
      }
    },
    minify: 'terser'
  }
});
