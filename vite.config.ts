import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Output directory for the extension bundle
    outDir: 'dist',
    emptyOutDir: true,

    // Multi-page entry points: popup + cropper
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        cropper: resolve(__dirname, 'cropper.html'),
      },
      output: {
        // Keep filenames predictable (no hashes) for extension context
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
})
