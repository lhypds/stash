import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  // PORT comes from .env (or the real environment); must match the server
  const server = `http://localhost:${loadEnv(mode, __dirname, '').PORT || 3001}`
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@ui': path.resolve(__dirname, 'src/ui'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@pages': path.resolve(__dirname, 'src/pages'),
        '@utils': path.resolve(__dirname, 'src/utils'),
        '@contexts': path.resolve(__dirname, 'src/contexts'),
        '@assets': path.resolve(__dirname, 'src/assets'),
      },
    },
    server: {
      proxy: {
        '/api': server,
        '/data': server,
      },
    },
  }
})
