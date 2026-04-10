import { useState, useRef } from 'react'
import { useTradeStore } from '../store/useTradeStore'
import { parseCsv, mapCsvToTrades, autoDetectMapping, detectBrokerFormat } from '../utils/csvImport'
import type { CsvRow, BrokerFormat } from '../utils/csvImport'
import type { AssetClass } from '../types/trade'
import { X, Upload, CheckCircle, Download } from 'lucide-react'

const BROKER_LABELS: Record<BrokerFormat, string> = {
  webull: 'Webull 格式',
  futu: '富途/Moomoo 格式',
  ibkr: 'Interactive Brokers 格式',
  template: 'TradeInsight 模板',
  generic: '通用格式',
}

async function downloadTemplate() {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('交易记录')

  // Column widths
  ws.columns = [
    { header: '标的代码', key: 'symbol', width: 12 },
    { header: '方向', key: 'direction', width: 10 },
    { header: '数量', key: 'quantity', width: 10 },
    { header: '价格', key: 'price', width: 12 },
    { header: '交易时间', key: 'traded_at', width: 22 },
    { header: '佣金', key: 'commission', width: 10 },
    { header: '品种类型', key: 'asset_class', width: 14 },
    { header: '合约乘数', key: 'multiplier', width: 12 },
    { header: '到期日', key: 'expiration', width: 14 },
    { header: '备注', key: 'notes', width: 20 },
  ]

  // Style header row
  const headerRow = ws.getRow(1)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })
  headerRow.height = 22

  // Example rows
  const rows = [
    ['AAPL', '买入', 100, 150.50, '2024-01-15 10:30:00', 1.00, '美股个股', 1, '', '示例买入'],
    ['AAPL', '卖出', 100, 160.00, '2024-02-20 14:00:00', 1.00, '美股个股', 1, '', '示例卖出'],
    ['MU', '买入', 4, 11.50, '2024-04-09 14:40:00', 0, '期权', 100, '2024-05-17', '期权合约×100'],
    ['BTC', '买入', 0.5, 42000, '2024-03-01 09:00:00', 5.00, '数字货币', 1, '', ''],
  ]
  rows.forEach((r) => ws.addRow(r))

  // Data validation: 方向 column (B)
  for (let i = 2; i <= 1000; i++) {
    ws.getCell(`B${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"买入,卖出,做空,平空"'],
      showErrorMessage: true,
      errorTitle: '无效值',
      error: '请从下拉列表中选择方向',
    }
  }

  // Data validation: 品种类型 column (G) — now index 7
  for (let i = 2; i <= 1000; i++) {
    ws.getCell(`G${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"美股个股,期权,ETF,数字货币,CFD,期货"'],
      showErrorMessage: true,
      errorTitle: '无效值',
      error: '请从下拉列表中选择品种类型',
    }
  }

  // Download
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'tradeinsight_导入模板.xlsx'; a.click()
  URL.revokeObjectURL(url)
}

interface Props { onClose: () => void }

const ASSET_CLASSES: { value: AssetClass; label: string }[] = [
  { value: 'equity', label: '美股个股' },
  { value: 'option', label: '期权' },
  { value: 'etf', label: 'ETF' },
  { value: 'crypto', label: '数字货币' },
  { value: 'cfd', label: 'CFD' },
  { value: 'futures', label: '期货' },
]

export default function CsvImportModal({ onClose }: Props) {
  const { importTrades, accounts } = useTradeStore()
  const [step, setStep] = useState<'upload' | 'map' | 'done'>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<CsvRow[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [detectedBroker, setDetectedBroker] = useState<BrokerFormat | null>(null)
  const [defaultAccount, setDefaultAccount] = useState(accounts[0]?.id || 'default')
  const [defaultAsset, setDefaultAsset] = useState<AssetClass>('equity')
  const [importCount, setImportCount] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const inp = (style?: React.CSSProperties): React.CSSProperties => ({
    width: '100%', padding: '7px 10px',
    background: '#22263a', border: '1px solid #2d3148',
    borderRadius: 6, color: '#e2e8f0', fontSize: 13,
    ...style,
  })

  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

  const handleFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      alert(`文件过大（${(file.size / 1024 / 1024).toFixed(1)} MB），最大支持 10 MB。`)
      return
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['csv', 'txt', 'xlsx'].includes(ext)) {
      alert('仅支持 CSV / XLSX / TXT 格式文件。')
      return
    }

    if (ext === 'xlsx') {
      // Parse Excel file
      const buf = await file.arrayBuffer()
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(buf)
      const ws = wb.worksheets[0]
      const allRows: string[][] = []
      ws.eachRow((row) => {
        const vals = (row.values as (unknown)[]).slice(1)
        allRows.push(vals.map((v) => {
          if (v == null) return ''
          if (typeof v === 'object' && v !== null && 'text' in v) return String((v as { text: string }).text)
          return String(v)
        }))
      })
      if (allRows.length < 1) { alert('Excel 文件为空'); return }
      const hdrs = allRows[0]
      const dataRows: CsvRow[] = allRows.slice(1).map((r) => {
        const obj: CsvRow = {}
        hdrs.forEach((h, i) => { obj[h] = r[i] ?? '' })
        return obj
      })
      setHeaders(hdrs)
      setRows(dataRows)
      setMapping(autoDetectMapping(hdrs))
      setDetectedBroker(detectBrokerFormat(hdrs))
      setStep('map')
    } else {
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        const { data, headers } = parseCsv(text)
        setHeaders(headers)
        setRows(data)
        setMapping(autoDetectMapping(headers))
        setDetectedBroker(detectBrokerFormat(headers))
        setStep('map')
      }
      reader.readAsText(file)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  const handleImport = () => {
    const trades = mapCsvToTrades(rows, mapping as Parameters<typeof mapCsvToTrades>[1], {
      account_id: defaultAccount,
      asset_class: defaultAsset,
    })
    importTrades(trades)
    setImportCount(trades.length)
    setStep('done')
  }

  const REQUIRED_FIELDS = [
    { key: 'symbol', label: '标的代码 *' },
    { key: 'direction', label: '方向 *' },
    { key: 'quantity', label: '数量 *' },
    { key: 'price', label: '价格 *' },
    { key: 'traded_at', label: '交易时间 *' },
    { key: 'commission', label: '佣金' },
    { key: 'asset_class', label: '品种类型' },
    { key: 'contract_multiplier', label: '合约乘数' },
    { key: 'expiration', label: '到期日' },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#1a1d27', border: '1px solid #2d3148',
        borderRadius: 16, padding: 24, width: '100%', maxWidth: 560,
        maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>CSV 导入</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8892a4' }}>
            <X size={20} />
          </button>
        </div>

        {step === 'upload' && (
          <div>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              style={{
                border: '2px dashed #2d3148', borderRadius: 12, padding: 40,
                textAlign: 'center', cursor: 'pointer', color: '#8892a4',
                transition: 'border-color 0.2s',
              }}
            >
              <Upload size={32} style={{ margin: '0 auto 12px', display: 'block', color: '#4a5268' }} />
              <div style={{ fontSize: 15, marginBottom: 6 }}>拖拽 CSV / Excel 文件到此处</div>
              <div style={{ fontSize: 13, color: '#4a5268' }}>或点击选择文件</div>
              <div style={{ fontSize: 12, color: '#3d4263', marginTop: 10 }}>
                自动识别: Webull · 富途/Moomoo · Interactive Brokers · 自定义模板
              </div>
              <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }} />
            </div>

            <div style={{ marginTop: 16, padding: 14, background: '#22263a', borderRadius: 8, fontSize: 12, color: '#8892a4' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13 }}>支持的字段（CSV 表头）</span>
                <button onClick={downloadTemplate} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 6,
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>
                  <Download size={12} />
                  下载模板
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                {[
                  ['标的代码', '必填，如 AAPL、BTC'],
                  ['方向', '买入 / 卖出 / 做空 / 平空'],
                  ['数量', '必填，正数'],
                  ['价格', '必填，单价'],
                  ['交易时间', '如 2024-01-15 10:30:00'],
                  ['佣金', '可选，默认 0'],
                  ['品种类型', '美股个股 / 期权 / ETF / 数字货币 / CFD / 期货'],
                  ['合约乘数', '可选，期权填100，期货按合约，默认1'],
                  ['到期日', '可选，期权到期日，如 2024-05-17'],
                  ['备注', '可选，备注信息'],
                ].map(([field, desc]) => (
                  <div key={field} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <span style={{ color: '#60a5fa', fontWeight: 600, whiteSpace: 'nowrap' }}>{field}</span>
                    <span style={{ color: '#6b7280', fontSize: 11 }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'map' && (
          <div>
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#22263a', borderRadius: 8, fontSize: 13, color: '#8892a4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>已检测到 <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{rows.length}</span> 行数据，请确认字段映射</span>
              {detectedBroker && (
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 8,
                  background: detectedBroker === 'generic' ? '#4a526820' : '#3b82f620',
                  color: detectedBroker === 'generic' ? '#8892a4' : '#60a5fa',
                  fontWeight: 600,
                }}>
                  {BROKER_LABELS[detectedBroker]}
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 4 }}>默认账户</label>
                <select value={defaultAccount} onChange={(e) => setDefaultAccount(e.target.value)} style={inp()}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 4 }}>默认品种</label>
                <select value={defaultAsset} onChange={(e) => setDefaultAsset(e.target.value as AssetClass)} style={inp()}>
                  {ASSET_CLASSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0', marginBottom: 10 }}>字段映射</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
              {REQUIRED_FIELDS.map(({ key, label }) => (
                <div key={key}>
                  <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 3 }}>{label}</label>
                  <select value={mapping[key] || ''} onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))} style={inp()}>
                    <option value="">(忽略)</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview */}
            {rows.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0', marginBottom: 8 }}>数据预览（前3行）</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr>
                        {Object.values(mapping).filter(Boolean).map((h) => (
                          <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: '#8892a4', borderBottom: '1px solid #2d3148' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 3).map((row, i) => (
                        <tr key={i}>
                          {Object.values(mapping).filter(Boolean).map((h) => (
                            <td key={h} style={{ padding: '4px 8px', color: '#e2e8f0', borderBottom: '1px solid #2d3148' }}>{row[h]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setStep('upload')} style={{
                padding: '9px 20px', borderRadius: 8, border: '1px solid #2d3148',
                background: 'transparent', color: '#8892a4', cursor: 'pointer', fontSize: 14,
              }}>返回</button>
              <button onClick={handleImport} disabled={!mapping.symbol || !mapping.direction || !mapping.quantity || !mapping.price || !mapping.traded_at} style={{
                padding: '9px 24px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                opacity: (!mapping.symbol || !mapping.direction || !mapping.quantity || !mapping.price || !mapping.traded_at) ? 0.5 : 1,
              }}>
                导入 {rows.length} 条记录
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircle size={48} style={{ color: '#22c55e', margin: '0 auto 16px', display: 'block' }} />
            <div style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>导入成功</div>
            <div style={{ fontSize: 14, color: '#8892a4', marginBottom: 24 }}>
              已成功导入 <span style={{ color: '#22c55e', fontWeight: 600 }}>{importCount}</span> 条交易记录
            </div>
            <button onClick={onClose} style={{
              padding: '9px 24px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}>完成</button>
          </div>
        )}
      </div>
    </div>
  )
}
