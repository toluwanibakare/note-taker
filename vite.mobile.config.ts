import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import pkg from './package.json'

// Builds the web bundle that Capacitor wraps into the Android app (see capacitor.config.ts).
export default defineConfig({
  root: resolve(__dirname),
  base: './',
  resolve: { alias: { '@': resolve(__dirname, './src/renderer/src') } },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(__dirname, 'dist-mobile'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { input: resolve(__dirname, 'mobile/index.html') }
  }
})
