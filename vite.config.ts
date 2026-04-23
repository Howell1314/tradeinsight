import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: {
    format: 'es',
  },
  server: {
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://s3.tradingview.com https://*.tradingview.com",
        "style-src 'self' 'unsafe-inline' https://*.tradingview.com",
        "img-src 'self' data: blob: https://*.tradingview.com https://*.tradingview-widget.com",
        "font-src 'self' data: https://*.tradingview.com",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.tradingview.com https://*.tradingview-widget.com https://api.binance.com",
        "frame-src https://*.tradingview.com https://*.tradingview-widget.com",
        "frame-ancestors 'none'",
      ].join('; '),
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  },
})
