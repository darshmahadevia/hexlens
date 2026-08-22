import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves this project below /hexlens/. Local development stays
  // at / so the same client can be exercised without a deployment prefix.
  base: process.env.VITE_BASE_PATH ?? '/',
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
