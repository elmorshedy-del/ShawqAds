import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@nivo') || id.includes('/node_modules/d3')) return 'charts';
          if (id.includes('/node_modules/react') || id.includes('/node_modules/react-dom')) return 'react';
          return undefined;
        },
      },
    },
  },
});
