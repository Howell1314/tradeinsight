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
  /** 计划止损价（用于计算 R 倍数） */
  planned_stop?: number
  /** 计划目标价 */
  planned_target?: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at?: string
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
  /** 初始风险金额 (|price - planned_stop| × qty × multiplier)，有止损时才存在 */
  initial_risk?: number
  /** 实际 R 倍数 = net_pnl / initial_risk */
  actual_r?: number
}

export interface Account {
  id: string
  name: string
  currency: string
  broker?: string
  initial_capital?: number
}

