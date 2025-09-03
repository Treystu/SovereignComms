import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sw: resolve(__dirname, 'sw.ts'),
      },
    },
  },
  worker: { format: 'es' },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      process.env.npm_package_version,
    ),
    'import.meta.env.VITE_WS_URL': JSON.stringify(
      process.env.VITE_WS_URL || '',
    ),
  },
});
