import { defineConfig } from 'vite';

// base relativa: el mismo build funciona en GitHub Pages (subcarpeta) y en local.
export default defineConfig({
  base: './',
});
