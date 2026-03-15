import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1423,
    strictPort: true,
  },
  base: './',
  resolve: {
    conditions: ['browser', 'module', 'import', 'default'],
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
});
