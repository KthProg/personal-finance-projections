import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/chat': {
        target: 'http://localhost:3001',
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            for (const [key, val] of Object.entries(proxyRes.headers)) {
              if (val !== undefined) res.setHeader(key, val)
            }
            res.writeHead(proxyRes.statusCode ?? 200)
            proxyRes.pipe(res)
          })
        },
      },
      '/api': 'http://localhost:3001',
    },
  },
})
