import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  positive?: boolean
  negative?: boolean
  icon?: ReactNode
  color?: string
}

export default function StatCard({ label, value, sub, positive, negative, icon, color }: StatCardProps) {
  const accentColor = positive ? '#22c55e' : negative ? '#ef4444' : color || '#3b82f6'
  const valueColor = positive ? '#22c55e' : negative ? '#ef4444' : color || '#e2e8f0'

  return (
    <div style={{
      background: 'linear-gradient(145deg, #1a1d27 0%, #1d2136 100%)',
      border: '1px solid #2d3148',
      borderTop: `2px solid ${accentColor}`,
      borderRadius: 12,
      padding: '16px 18px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Subtle glow */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 60,
        background: `radial-gradient(ellipse at top, ${accentColor}08 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#8892a4', letterSpacing: '0.04em', fontWeight: 500 }}>{label}</span>
        {icon && (
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: `${accentColor}18`,
            border: `1px solid ${accentColor}25`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: accentColor, flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: valueColor, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#4a5268', marginTop: 6, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}
