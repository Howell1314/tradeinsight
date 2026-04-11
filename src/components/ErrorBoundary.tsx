import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0f1117', padding: 24,
        }}>
          <div style={{
            background: '#1a1d27', border: '1px solid #ef444440', borderTop: '3px solid #ef4444',
            borderRadius: 14, padding: '32px 36px', maxWidth: 520, width: '100%',
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f87171', marginBottom: 12 }}>
              ⚠ 页面发生错误
            </div>
            <div style={{ fontSize: 13, color: '#8892a4', marginBottom: 20, lineHeight: 1.7 }}>
              渲染过程中出现了一个意外错误。您的数据已安全保存在本地存储中，刷新页面即可恢复。
            </div>
            <details style={{ marginBottom: 20 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: '#4a5268', marginBottom: 8 }}>
                技术详情
              </summary>
              <pre style={{
                background: '#161924', borderRadius: 8, padding: '10px 14px',
                fontSize: 11, color: '#6b7280', overflow: 'auto', maxHeight: 200,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            </details>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '9px 24px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}
            >
              刷新页面
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
