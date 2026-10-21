import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          // 큰 컴포넌트들을 별도 청크로 분리해서 번들 순환 의존성 제거
          if (id.includes('node_modules')) {
            if (id.includes('react')) return 'react';
            if (id.includes('axios') || id.includes('fetch')) return 'http';
            return 'vendors';
          }
          
          // 컴포넌트들을 카테고리별로 분리
          if (id.includes('src/components')) {
            if (id.includes('Modal')) return 'modals';
            if (id.includes('View')) return 'views';
            return 'components';
          }
        },
      },
    },
  },
});
