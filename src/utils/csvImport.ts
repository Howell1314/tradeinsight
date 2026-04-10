import Papa from 'papaparse'
import type { Trade, AssetClass, Direction } from '../types/trade'
import { generateId } from './calculations'

export interface CsvRow {
  [key: string]: string
}

/** 防止 CSV 公式注入：以 = + - @ TAB CR 开头的值加单引号前缀 */
function sanitizeCell(value: string): string {
  const trimmed = value.trim()
  if (/^[=+\-@\t\r]/.test(trimmed)) return `'${trimmed}`
  return trimmed
}

/** 清理表头：限长、移除特殊字符 */
function sanitizeHeader(h: string): string {
  return h.replace(/[<>'"]/g, '').slice(0, 100).toLowerCase()
}

/** 安全的数值解析，返回 null 表示无效 */
function safeFloat(raw: string | undefined, allowZero = false): number | null {
  if (!raw) return null
  const n = parseFloat(raw.trim())
  if (!isFinite(n)) return null
  if (!allowZero && n <= 0) return null
  return n
}

// Generic CSV import with field mapping
export function parseCsv(text: string): { data: CsvRow[]; headers: string[] } {
  const result = Papa.parse<CsvRow>(text, { header: true, skipEmptyLines: true })
  return {
    data: result.data,
    headers: result.meta.fields || [],
  }
}

// Map CSV rows to Trade objects given a field mapping
export function mapCsvToTrades(
  rows: CsvRow[],
  mapping: {
    symbol: string
    direction: string
    quantity: string
    price: string
    commission: string
    traded_at: string
    asset_class: string
    contract_multiplier?: string
    expiration?: string
    account_id?: string
    notes?: string
  },
  defaults: { account_id: string; asset_class: AssetClass },
): Trade[] {
  const trades: Trade[] = []

  for (const row of rows) {
    // Direction (supports Chinese and English)
    const dirRaw = (row[mapping.direction] || '').toLowerCase().trim()
    let direction: Direction = 'buy'
    if (['sell', 's', 'sold', '卖出', '卖'].includes(dirRaw)) direction = 'sell'
    else if (['short', 'ss', '做空', '沽空'].includes(dirRaw)) direction = 'short'
    else if (['cover', 'bc', 'buy to cover', '平空', '回补'].includes(dirRaw)) direction = 'cover'

    // Numeric fields — skip row if invalid
    const qty = safeFloat(row[mapping.quantity])
    const price = safeFloat(row[mapping.price])
    if (qty === null || price === null) continue

    const commission = safeFloat(row[mapping.commission], true) ?? 0

    // Asset class (supports Chinese and English)
    let asset_class: AssetClass = defaults.asset_class
    if (mapping.asset_class && row[mapping.asset_class]) {
      const raw = row[mapping.asset_class].toLowerCase()
      if (raw.includes('crypto') || raw.includes('btc') || raw.includes('eth') || raw.includes('数字货币') || raw.includes('加密')) asset_class = 'crypto'
      else if (raw.includes('option') || raw.includes('期权')) asset_class = 'option'
      else if (raw.includes('etf')) asset_class = 'etf'
      else if (raw.includes('cfd')) asset_class = 'cfd'
      else if (raw.includes('future') || raw.includes('期货')) asset_class = 'futures'
      else asset_class = 'equity'
    }

    // Date
    const dateStr = row[mapping.traded_at] || new Date().toISOString()
    const tradeDate = isNaN(Date.parse(dateStr)) ? new Date().toISOString() : new Date(dateStr).toISOString()

    // Symbol: sanitize + length limit + format check
    const rawSymbol = sanitizeCell(row[mapping.symbol] || '').toUpperCase()
    if (!rawSymbol || rawSymbol.length > 30) continue
    const symbol = rawSymbol.replace(/[^A-Z0-9/.\-_]/, '')
    if (!symbol) continue

    // Notes: sanitize + limit
    const notes = mapping.notes
      ? sanitizeCell(row[mapping.notes] || '').slice(0, 2000)
      : ''

    const multiplier = mapping.contract_multiplier
      ? (safeFloat(row[mapping.contract_multiplier], true) ?? 1)
      : 1

    const expiration = mapping.expiration ? (row[mapping.expiration] || '') : ''

    trades.push({
      id: generateId(),
      account_id: mapping.account_id ? row[mapping.account_id] || defaults.account_id : defaults.account_id,
      asset_class,
      symbol,
      direction,
      quantity: qty,
      price,
      total_amount: qty * price * multiplier,
      commission,
      fees: 0,
      currency: 'USD',
      traded_at: tradeDate,
      strategy_tags: [],
      notes,
      metadata: { contract_multiplier: multiplier, expiration },
      created_at: new Date().toISOString(),
    } as Trade)
  }

  return trades
}

export type BrokerFormat = 'webull' | 'futu' | 'ibkr' | 'generic' | 'template'

/** Detect which broker format a CSV might be */
export function detectBrokerFormat(headers: string[]): BrokerFormat {
  const h = headers.map((s) => s.toLowerCase().trim())
  const has = (s: string) => h.some((x) => x.includes(s))

  // Webull: "Symbol", "Side", "Avg Price", "Filled Qty", "Filled Amount", "Commission"
  if (has('filled qty') || has('filled amount') || (has('side') && has('avg price') && has('filled'))) return 'webull'

  // Futu/Moomoo: "股票代码" or "Ticker" with "成交均价" or "成交数量"
  if (has('成交均价') || has('成交数量') || has('股票代码') || (has('mkt') && has('ref. price'))) return 'futu'

  // IBKR: "Asset Category", "T. Price", "Comm/Fee" or "IBOrder ID"
  if (has('t. price') || has('comm/fee') || has('iborder') || has('asset category')) return 'ibkr'

  // Our template: Chinese headers
  if (has('标的代码') || has('合约乘数') || has('品种类型')) return 'template'

  return 'generic'
}

/** Broker-specific field mappings */
const BROKER_MAPPINGS: Record<BrokerFormat, (headers: string[]) => Record<string, string>> = {
  webull: (headers) => {
    const h = headers.map((s) => s.toLowerCase().trim())
    const pick = (candidates: string[]) => {
      for (const c of candidates) { const i = h.findIndex((x) => x.includes(c)); if (i >= 0) return headers[i] }
      return ''
    }
    return {
      symbol: pick(['symbol', 'ticker']),
      direction: pick(['side', 'action', 'direction']),
      quantity: pick(['filled qty', 'qty', 'quantity', 'shares']),
      price: pick(['avg price', 'price', 'execution price']),
      commission: pick(['commission', 'fee', 'fees']),
      traded_at: pick(['time', 'trade time', 'date', 'filled time']),
      asset_class: pick(['type', 'asset type', 'instrument type']),
      contract_multiplier: '',
      expiration: pick(['expiry', 'expiration', 'exp date']),
      notes: pick(['notes', 'remark', 'memo']),
    }
  },
  futu: (headers) => {
    const h = headers.map((s) => s.toLowerCase().trim())
    const pick = (candidates: string[]) => {
      for (const c of candidates) { const i = h.findIndex((x) => x.includes(c)); if (i >= 0) return headers[i] }
      return ''
    }
    return {
      symbol: pick(['股票代码', 'ticker', 'symbol', 'code']),
      direction: pick(['买卖方向', '方向', 'direction', 'side', 'bs']),
      quantity: pick(['成交数量', '数量', 'quantity', 'qty', 'shares']),
      price: pick(['成交均价', '成交价', '均价', 'price', 'avg price']),
      commission: pick(['佣金', 'commission', 'fee']),
      traded_at: pick(['成交时间', '日期', '时间', 'date', 'time', 'trade date']),
      asset_class: pick(['品种', 'asset', 'type', 'product type']),
      contract_multiplier: '',
      expiration: pick(['到期日', 'expiry', 'expiration']),
      notes: pick(['备注', 'notes', 'remark']),
    }
  },
  ibkr: (headers) => {
    const h = headers.map((s) => s.toLowerCase().trim())
    const pick = (candidates: string[]) => {
      for (const c of candidates) { const i = h.findIndex((x) => x.includes(c)); if (i >= 0) return headers[i] }
      return ''
    }
    return {
      symbol: pick(['symbol', 'ticker']),
      direction: pick(['buy/sell', 'action', 'direction', 'side']),
      quantity: pick(['quantity', 'qty', 'shares']),
      price: pick(['t. price', 'price', 'avg price', 'trade price']),
      commission: pick(['comm/fee', 'commission', 'fee']),
      traded_at: pick(['date/time', 'datetime', 'date', 'time', 'trade date']),
      asset_class: pick(['asset category', 'type', 'instrument type']),
      contract_multiplier: pick(['multiplier', 'contract multiplier']),
      expiration: pick(['expiry', 'expiration', 'exp date', 'last trade date']),
      notes: pick(['notes', 'description']),
    }
  },
  template: (headers) => autoDetectMappingGeneric(headers),
  generic: (headers) => autoDetectMappingGeneric(headers),
}

function autoDetectMappingGeneric(headers: string[]): Record<string, string> {
  const sanitized = headers.map(sanitizeHeader)
  const find = (candidates: string[]) => {
    for (const c of candidates) {
      const idx = sanitized.findIndex((h) => h.includes(c))
      if (idx >= 0) return headers[idx]
    }
    return ''
  }
  return {
    symbol: find(['标的代码', '标的', 'symbol', 'ticker', 'instrument', 'security']),
    direction: find(['方向', 'action', 'direction', 'side', 'type', 'buy/sell', 'transaction']),
    quantity: find(['数量', 'quantity', 'qty', 'shares', 'amount', 'contracts', 'units']),
    price: find(['价格', 'price', 'avg price', 'execution price', 'fill price']),
    commission: find(['佣金', 'commission', 'fee', 'fees', 'cost']),
    traded_at: find(['交易时间', '日期', 'date', 'time', 'datetime', 'trade date', 'execution time', 'trade time']),
    asset_class: find(['品种类型', '品种', 'asset', 'class', 'type', 'instrument type', 'product type']),
    contract_multiplier: find(['合约乘数', '乘数', 'multiplier', 'contract multiplier', 'contract_multiplier']),
    expiration: find(['到期日', '到期', '期权到期', 'expiration', 'expiry', 'expiry date', 'exp date']),
    notes: find(['备注', 'notes', 'note', 'memo', 'comment', 'remark']),
  }
}

// Auto-detect common broker CSV formats
export function autoDetectMapping(headers: string[]): Record<string, string> {
  const format = detectBrokerFormat(headers)
  return BROKER_MAPPINGS[format](headers)
}
