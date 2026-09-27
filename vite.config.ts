import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Keep emitted asset URLs relative so both GitHub Pages subpaths and custom-domain roots work.
  base: './',
})
