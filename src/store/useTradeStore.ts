import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Trade, Account, ClosedTrade, Position, AccountTransaction } from '../types/trade'
import { processTradesIntoPositions, computeStats } from '../utils/calculations'
import type { DashboardStats } from '../utils/calculations'
import {
  loadCloudData, upsertTrade, upsertTrades, deleteCloudTrade,
  upsertAccount, upsertAccounts, deleteCloudAccount,
  loadAccountTransactions, upsertAccountTransactions, deleteCloudAccountTransaction,
  loadRiskRules, upsertRiskRules,
} from '../lib/syncTrades'

const VALID_ASSET_CLASSES = ['crypto', 'equity', 'option', 'etf', 'cfd', 'futures']
const VALID_DIRECTIONS = ['buy', 'sell', 'short', 'cover']

/** Validate a trade loaded from localStorage to reject tampered/corrupt data */
function isValidTrade(t: unknown): t is Trade {
  if (!t || typeof t !== 'object') return false
  const tr = t as Record<string, unknown>
  return (
    typeof tr.id === 'string' && tr.id.length <= 64 &&
    typeof tr.account_id === 'string' &&
    VALID_ASSET_CLASSES.includes(tr.asset_class as string) &&
    typeof tr.symbol === 'string' && tr.symbol.length <= 30 &&
    VALID_DIRECTIONS.includes(tr.direction as string) &&
    typeof tr.quantity === 'number' && isFinite(tr.quantity) && tr.quantity > 0 &&
    typeof tr.price === 'number' && isFinite(tr.price) && tr.price >= 0 &&
    typeof tr.total_amount === 'number' && isFinite(tr.total_amount) &&
    typeof tr.commission === 'number' && isFinite(tr.commission) &&
    typeof tr.traded_at === 'string' &&
    Array.isArray(tr.strategy_tags) &&
    typeof tr.notes === 'string' && tr.notes.length <= 5001 &&
    tr.metadata !== null && typeof tr.metadata === 'object' && !Array.isArray(tr.metadata)
  )
}

function isValidAccount(a: unknown): a is Account {
  if (!a || typeof a !== 'object') return false
  const acc = a as Record<string, unknown>
  return typeof acc.id === 'string' && typeof acc.name === 'string' && acc.name.length <= 100
}

/** Check if a sell/cover trade would exceed current holdings */
function validateNewTrade(trade: Trade, openPositions: Position[]): string | null {
  if (trade.direction === 'sell') {
    const available = openPositions
      .filter(p => p.account_id === trade.account_id && p.symbol === trade.symbol && p.quantity > 0)
      .reduce((s, p) => s + p.quantity, 0)
    if (available > 0 && trade.quantity > available + 0.0001) {
      return `卖出数量 (${trade.quantity}) 超过多头持仓 (${available.toFixed(4)})，请检查数量`
    }
  } else if (trade.direction === 'cover') {
    const available = openPositions
      .filter(p => p.account_id === trade.account_id && p.symbol === trade.symbol && p.quantity < 0)
      .reduce((s, p) => s + Math.abs(p.quantity), 0)
    if (available > 0 && trade.quantity > available + 0.0001) {
      return `平空数量 (${trade.quantity}) 超过空头持仓 (${available.toFixed(4)})，请检查数量`
    }
  }
  return null
}

export interface RiskRules {
  monthlyTarget?: number
  maxDailyLoss?: number
  maxPositionRiskPct?: number
  maxWeeklyLoss?: number
  maxConsecutiveLosses?: number
}

interface TradeStore {
  trades: Trade[]
  accounts: Account[]
  accountTransactions: AccountTransaction[]
  selectedAccount: string | null
  view: 'dashboard' | 'trades' | 'positions' | 'analytics' | 'journal' | 'profile' | 'chart'
  userId: string | null
  cloudSynced: boolean
  currentPrices: Record<string, number>     // key: "accountId::symbol"
  currentPriceTimes: Record<string, number>  // key: "accountId::symbol" → epoch ms
  riskRules: RiskRules

  // Derived
  closedTrades: ClosedTrade[]
  openPositions: Position[]
  stats: DashboardStats

  // Actions
  addTrade: (trade: Trade) => string | null
  updateTrade: (id: string, updates: Partial<Trade>) => void
  deleteTrade: (id: string) => void
  importTrades: (trades: Trade[]) => void
  addAccount: (account: Account) => void
  updateAccount: (id: string, updates: Partial<Account>) => void
  deleteAccount: (id: string) => void
  setSelectedAccount: (id: string | null) => void
  setView: (view: TradeStore['view']) => void
  recompute: () => void
  updateCurrentPrice: (accountId: string, symbol: string, price: number) => void
  addAccountTransaction: (tx: AccountTransaction) => void
  deleteAccountTransaction: (id: string) => void
  setRiskRules: (rules: RiskRules) => void
  /** Called on login: loads cloud data and replaces local store */
  syncFromCloud: (userId: string) => Promise<void>
  /** Called on logout: clears user data from store */
  clearUserData: () => void
}

function applyCurrentPrices(positions: Position[], currentPrices: Record<string, number>): Position[] {
  return positions.map(pos => {
    const key = `${pos.account_id}::${pos.symbol}`
    const cp = currentPrices[key] ?? pos.avg_cost
    const mult = pos.contract_multiplier ?? 1
    const isShort = pos.quantity < 0
    const qty = Math.abs(pos.quantity)
    const unrealized_pnl = isShort
      ? (pos.avg_cost - cp) * qty * mult
      : (cp - pos.avg_cost) * qty * mult
    const unrealized_pnl_pct = pos.avg_cost > 0
      ? (isShort ? (pos.avg_cost - cp) / pos.avg_cost : (cp - pos.avg_cost) / pos.avg_cost) * 100
      : 0
    return { ...pos, current_price: cp, unrealized_pnl, unrealized_pnl_pct }
  })
}

// Module-level cache for the expensive processTradesIntoPositions + computeStats step.
// When only currentPrices changes (e.g. price refresh), we skip re-processing trades.
let _coreCache: {
  trades: Trade[]
  selectedAccount: string | null
  closedTrades: ClosedTrade[]
  rawPositions: Position[]
  stats: DashboardStats
} | null = null

function deriveCore(trades: Trade[], selectedAccount: string | null) {
  if (_coreCache && _coreCache.trades === trades && _coreCache.selectedAccount === selectedAccount) {
    return _coreCache
  }
  const filtered = selectedAccount ? trades.filter((t) => t.account_id === selectedAccount) : trades
  const { closedTrades, openPositions: rawPositions } = processTradesIntoPositions(filtered)
  const stats = computeStats(closedTrades)
  _coreCache = { trades, selectedAccount, closedTrades, rawPositions, stats }
  return _coreCache
}

function derive(trades: Trade[], selectedAccount: string | null, currentPrices: Record<string, number> = {}) {
  const { closedTrades, rawPositions, stats } = deriveCore(trades, selectedAccount)
  const openPositions = applyCurrentPrices(rawPositions, currentPrices)
  return { closedTrades, openPositions, stats }
}

const EMPTY_STATS: DashboardStats = {
  total_pnl: 0, realized_pnl: 0, unrealized_pnl: 0,
  win_rate: 0, total_trades: 0, winning_trades: 0, losing_trades: 0,
  avg_win: 0, avg_loss: 0, risk_reward: 0, expectancy: 0,
  max_drawdown: 0, profit_factor: 0, sharpe_ratio: 0,
  max_consecutive_wins: 0, max_consecutive_losses: 0, avg_holding_days: 0,
}

export const useTradeStore = create<TradeStore>()(
  persist(
    (set, get) => ({
      trades: [],
      accounts: [{ id: 'default', name: '默认账户', currency: 'USD' }],
      accountTransactions: [],
      selectedAccount: null,
      view: 'dashboard',
      userId: null,
      cloudSynced: false,
      currentPrices: {},
      currentPriceTimes: {},
      riskRules: {},
      closedTrades: [],
      openPositions: [],
      stats: EMPTY_STATS,

      addTrade: (trade) => {
        const { openPositions } = get()
        const error = validateNewTrade(trade, openPositions)
        if (error) return error

        const stamped = { ...trade, updated_at: new Date().toISOString() }
        set((s) => {
          const trades = [...s.trades, stamped]
          if (s.userId) void upsertTrade(s.userId, stamped)
          return { trades, ...derive(trades, s.selectedAccount, s.currentPrices) }
        })
        return null
      },

      updateTrade: (id, updates) => {
        set((s) => {
          const trades = s.trades.map((t) =>
            t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
          )
          if (s.userId) {
            const updated = trades.find((t) => t.id === id)
            if (updated) void upsertTrade(s.userId, updated)
          }
          return { trades, ...derive(trades, s.selectedAccount, s.currentPrices) }
        })
      },

      deleteTrade: (id) => {
        set((s) => {
          if (s.userId) void deleteCloudTrade(s.userId, id)
          const trades = s.trades.filter((t) => t.id !== id)
          return { trades, ...derive(trades, s.selectedAccount, s.currentPrices) }
        })
      },

      importTrades: (newTrades) => {
        set((s) => {
          const trades = [...s.trades, ...newTrades]
          if (s.userId) void upsertTrades(s.userId, newTrades)
          return { trades, ...derive(trades, s.selectedAccount, s.currentPrices) }
        })
      },

      addAccount: (account) => {
        set((s) => {
          if (s.userId) void upsertAccount(s.userId, account)
          return { accounts: [...s.accounts, account] }
        })
      },

      updateAccount: (id, updates) => {
        set((s) => {
          const accounts = s.accounts.map((a) => (a.id === id ? { ...a, ...updates } : a))
          if (s.userId) {
            const updated = accounts.find((a) => a.id === id)
            if (updated) void upsertAccount(s.userId, updated)
          }
          return { accounts }
        })
      },

      deleteAccount: (id) => {
        set((s) => {
          if (s.userId) void deleteCloudAccount(s.userId, id)
          return { accounts: s.accounts.filter((a) => a.id !== id) }
        })
      },

      setSelectedAccount: (id) => {
        set((s) => {
          const derived = derive(s.trades, id, s.currentPrices)
          return { selectedAccount: id, ...derived }
        })
      },

      setView: (view) => set({ view }),

      recompute: () => {
        set((s) => derive(s.trades, s.selectedAccount, s.currentPrices))
      },

      updateCurrentPrice: (accountId, symbol, price) => {
        set((s) => {
          const key = `${accountId}::${symbol}`
          const currentPrices = { ...s.currentPrices, [key]: price }
          const currentPriceTimes = { ...s.currentPriceTimes, [key]: Date.now() }
          const openPositions = applyCurrentPrices(
            s.openPositions.map(p => ({ ...p })),
            currentPrices,
          )
          return { currentPrices, currentPriceTimes, openPositions }
        })
      },

      addAccountTransaction: (tx) => {
        set((s) => {
          if (s.userId) void upsertAccountTransactions(s.userId, [tx])
          return { accountTransactions: [...s.accountTransactions, tx] }
        })
      },

      deleteAccountTransaction: (id) => {
        set((s) => {
          if (s.userId) void deleteCloudAccountTransaction(s.userId, id)
          return { accountTransactions: s.accountTransactions.filter((t) => t.id !== id) }
        })
      },

      setRiskRules: (rules) => {
        set((s) => {
          if (s.userId) void upsertRiskRules(s.userId, rules)
          return { riskRules: rules }
        })
      },

      syncFromCloud: async (userId) => {
        set({ userId })
        const [data, cloudTxs, cloudRules] = await Promise.all([
          loadCloudData(userId),
          loadAccountTransactions(userId),
          loadRiskRules(userId),
        ])
        if (!data) return // keep local data if network fails

        let { trades, accounts } = data
        trades = trades.filter(isValidTrade)
        accounts = accounts.filter(isValidAccount)

        if (!accounts.some((a) => a.id === 'default')) {
          const defaultAcc = { id: 'default', name: '默认账户', currency: 'USD' }
          accounts = [defaultAcc, ...accounts]
          void upsertAccount(userId, defaultAcc)
        }

        // Merge: last-write-wins per trade using updated_at
        const { trades: localTrades, accounts: localAccounts, accountTransactions: localTxs } = get()
        if (trades.length === 0 && localTrades.length > 0) {
          void upsertTrades(userId, localTrades)
          void upsertAccounts(userId, localAccounts.filter((a) => a.id !== 'default'))
          if (localTxs.length > 0) void upsertAccountTransactions(userId, localTxs)
          set({ userId, cloudSynced: true, ...derive(localTrades, get().selectedAccount, get().currentPrices) })
          return
        }

        // Build merged trade list: for each id, keep the record with the later updated_at
        const tradeMap = new Map<string, Trade>()
        for (const t of localTrades) tradeMap.set(t.id, t)
        const toUpsertToCloud: Trade[] = []
        for (const cloudTrade of trades) {
          const local = tradeMap.get(cloudTrade.id)
          if (!local) {
            tradeMap.set(cloudTrade.id, cloudTrade) // cloud-only trade → take it
          } else {
            const cloudTime = cloudTrade.updated_at ?? cloudTrade.created_at
            const localTime = local.updated_at ?? local.created_at
            if (cloudTime >= localTime) {
              tradeMap.set(cloudTrade.id, cloudTrade) // cloud is newer
            } else {
              toUpsertToCloud.push(local) // local is newer → push to cloud
            }
          }
        }
        if (toUpsertToCloud.length > 0) void upsertTrades(userId, toUpsertToCloud)

        // Merge account transactions: union by id, local-only entries pushed to cloud
        let mergedTxs = localTxs
        if (cloudTxs !== null) {
          const cloudTxIds = new Set(cloudTxs.map((t) => t.id))
          const localOnly = localTxs.filter((t) => !cloudTxIds.has(t.id))
          if (localOnly.length > 0) void upsertAccountTransactions(userId, localOnly)
          mergedTxs = [...cloudTxs, ...localOnly]
        }

        const mergedTrades = Array.from(tradeMap.values())
        set({
          userId,
          trades: mergedTrades,
          accounts,
          accountTransactions: mergedTxs,
          // Cloud wins for risk rules; fall back to local if cloud has none
          ...(cloudRules ? { riskRules: cloudRules } : {}),
          cloudSynced: true,
          ...derive(mergedTrades, get().selectedAccount, get().currentPrices),
        })
      },

      clearUserData: () => {
        set({
          userId: null, cloudSynced: false,
          trades: [], accounts: [{ id: 'default', name: '默认账户', currency: 'USD' }],
          accountTransactions: [],
          selectedAccount: null, closedTrades: [], openPositions: [],
          stats: EMPTY_STATS,
        })
      },
    }),
    {
      name: 'tradeinsight-store',
      partialize: (s) => ({
        trades: s.trades,
        accounts: s.accounts,
        accountTransactions: s.accountTransactions,
        selectedAccount: s.selectedAccount,
        currentPrices: s.currentPrices,
        currentPriceTimes: s.currentPriceTimes,
        riskRules: s.riskRules,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Validate and sanitize persisted data before use
          state.trades = Array.isArray(state.trades) ? state.trades.filter(isValidTrade) : []
          state.accounts = Array.isArray(state.accounts) ? state.accounts.filter(isValidAccount) : []
          state.accountTransactions = Array.isArray(state.accountTransactions) ? state.accountTransactions : []
          state.currentPrices = (state.currentPrices && typeof state.currentPrices === 'object') ? state.currentPrices : {}
          state.currentPriceTimes = (state.currentPriceTimes && typeof state.currentPriceTimes === 'object') ? state.currentPriceTimes : {}
          state.riskRules = (state.riskRules && typeof state.riskRules === 'object') ? state.riskRules : {}
          if (!state.accounts.some((a) => a.id === 'default')) {
            state.accounts.unshift({ id: 'default', name: '默认账户', currency: 'USD' })
          }
          const derived = derive(state.trades, state.selectedAccount, state.currentPrices)
          state.closedTrades = derived.closedTrades
          state.openPositions = derived.openPositions
          state.stats = derived.stats
        }
      },
    },
  ),
)
