export type AssetClass = 'crypto' | 'equity' | 'option' | 'etf' | 'cfd' | 'futures'
export type Direction = 'buy' | 'sell' | 'short' | 'cover'
export type EmotionTag = 'calm' | 'impulsive' | 'hesitant' | 'confident'
export type CostMethod = 'fifo' | 'lifo' | 'specific'

export interface Trade {
  id: string
  account_id: string
  asset_class: AssetClass
  symbol: string
  direction: Direction
  quantity: number
  price: number
  total_amount: number
  commission: number
  fees: number
  currency: string
  traded_at: string // ISO string
  strategy_tags: string[]
  notes: string
  emotion?: EmotionTag
  metadata: Record<string, unknown>
  created_at: string
}

export interface Position {
  id: string
  account_id: string
  asset_class: AssetClass
  symbol: string
  quantity: number
  avg_cost: number
  current_price: number
  unrealized_pnl: number
  unrealized_pnl_pct: number
  opened_at: string
  trades: Trade[]
  contract_multiplier: number
}

export interface AccountTransaction {
  id: string
  account_id: string
  type: 'deposit' | 'withdrawal'
  amount: number
  date: string
  note: string
}

export interface ClosedTrade {
  id: string
  symbol: string
  asset_class: AssetClass
  account_id: string
  direction: 'long' | 'short'
  open_trades: Trade[]
  close_trades: Trade[]
  open_price: number
  close_price: number
  quantity: number
  gross_pnl: number
  net_pnl: number
  commission: number
  fees: number
  opened_at: string
  closed_at: string
  holding_days: number
  strategy_tags: string[]
}

export interface Account {
  id: string
  name: string
  currency: string
  broker?: string
  initial_capital?: number
}

