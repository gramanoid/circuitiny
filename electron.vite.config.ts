import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: { outDir: resolve(__dirname, 'out/main'), rollupOptions: { input: resolve(__dirname, 'electron/main.ts') } }
  },
  preload: {
    build: { outDir: resolve(__dirname, 'out/preload'), rollupOptions: { input: resolve(__dirname, 'electron/preload.ts') } }
  },
  renderer: {
    root: 'src',
    build: { outDir: resolve(__dirname, 'out/renderer'), rollupOptions: { input: resolve(__dirname, 'src/index.html') } },
    resolve: { alias: { '@': resolve(__dirname, 'src') } },
    plugins: [react()]
  }
})
