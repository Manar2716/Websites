import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `base: './'` keeps every asset reference relative, so the built site works
// from the repo root, from `/underground/` on Pages, and from a file:// open
// without knowing its own URL in advance.
//
// The bundle is emitted outside this folder so the deploy step can swap the
// source directory for the built one without a nested `dist/` in the URL.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../underground-dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
})
