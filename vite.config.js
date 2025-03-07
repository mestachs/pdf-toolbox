import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        format: "es", // or "cjs"
      },
    },
    worker: {
      format: "es", // or "cjs"
    },
  },  
})
