import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/echarts') || id.includes('/node_modules/echarts-for-react')) return 'charts';
          if (id.includes('/node_modules/react') || id.includes('/node_modules/react-dom')) return 'react';
          return undefined;
        },
      },
    },
  },
});
