import { defineConfig } from 'vite';

export default defineConfig({
  // Local URLs stay at /. GitHub Pages serves this repository under /sponsor-studio/.
  base: process.env.GITHUB_PAGES === 'true' ? '/sponsor-studio/' : '/',
  server: { host: '127.0.0.1' },
  build: { outDir: 'dist' },
});
