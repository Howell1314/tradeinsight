import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 生产 CSP 的唯一事实来源是 public/_headers（Cloudflare Pages 读的是那份）。
// 这里复刻同一套规则，只为让本地 dev / preview 能提前撞上生产会拦的东西。
// 改动必须两边同步 —— 此前 CSP 只存在于 server.headers，导致生产环境实际没有任何 CSP。
const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"], // 代码里 855 处 React 内联 style={{}}
  'img-src': ["'self'", 'data:', 'blob:', 'https://*.supabase.co'],
  'font-src': ["'self'", 'data:'],
  'connect-src': [
    "'self'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://api.binance.com',
  ],
  'frame-src': ['https://*.tradingview.com', 'https://*.tradingview-widget.com'],
  'worker-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
}

function buildCsp(mode: 'dev' | 'prod') {
  const directives: Record<string, string[]> = Object.fromEntries(
    Object.entries(CSP_DIRECTIVES).map(([k, v]) => [k, [...v]]),
  )
  if (mode === 'dev') {
    // @vitejs/plugin-react 在 dev 时向 index.html 注入内联的 React Refresh preamble，
    // HMR 又走 ws —— 这两条只在开发放开，生产不能带。
    directives['script-src'].push("'unsafe-inline'")
    directives['connect-src'].push('ws://localhost:*', 'ws://127.0.0.1:*')
  }
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ')
}

const securityHeaders = (mode: 'dev' | 'prod') => ({
  'Content-Security-Policy': buildCsp(mode),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
})

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: {
    format: 'es',
  },
  server: {
    headers: securityHeaders('dev'),
  },
  // preview 跑的是构建产物，用严格的那份，等同于生产
  preview: {
    headers: securityHeaders('prod'),
  },
})
