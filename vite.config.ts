import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@techstark/opencv-js'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'opencv': ['@techstark/opencv-js']
        }
      }
    }
  }
});
