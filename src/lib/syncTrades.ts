import { supabase } from './supabase'
import type { Trade, Account, AccountTransaction } from '../types/trade'
import type { RiskRules } from '../store/useTradeStore'

// ---- Journal entries ----
export interface JournalEntryDB {
  id: string; user_id?: string; date: string; summary: string
  went_well: string; improve: string; plan: string; pnl: number
  emotion: string; tags: string[]; images: string[]; review: string
  updated_at?: string
}

export async function loadCloudJournal(userId: string): Promise<JournalEntryDB[] | null> {
  const { data, error } = await supabase.from('journal_entries').select('*').eq('user_id', userId).order('date', { ascending: false })
  if (error) return null
  return data as JournalEntryDB[]
}

export async function upsertJournalEntry(userId: string, entry: Omit<JournalEntryDB, 'user_id'>): Promise<void> {
  const { error } = await supabase.from('journal_entries').upsert({ ...entry, user_id: userId, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function deleteJournalEntry(userId: string, entryId: string): Promise<void> {
  const { error } = await supabase.from('journal_entries').delete().eq('id', entryId).eq('user_id', userId)
  if (error) throw error
}

export async function loadCloudData(userId: string): Promise<{ trades: Trade[]; accounts: Account[] } | null> {
  const [tradesRes, accountsRes] = await Promise.all([
    supabase.from('trades').select('*').eq('user_id', userId),
    supabase.from('user_accounts').select('*').eq('user_id', userId),
  ])
  if (tradesRes.error || accountsRes.error) return null
  return {
    trades: (tradesRes.data ?? []) as Trade[],
    accounts: (accountsRes.data ?? []) as Account[],
  }
}

export async function upsertTrade(userId: string, trade: Trade): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase.from('trades').upsert({ ...trade, user_id: userId, updated_at: trade.updated_at ?? now })
  if (error) throw error
}

export async function upsertTrades(userId: string, trades: Trade[]): Promise<void> {
  if (!trades.length) return
  const now = new Date().toISOString()
  const { error } = await supabase.from('trades').upsert(
    trades.map((t) => ({ ...t, user_id: userId, updated_at: t.updated_at ?? now }))
  )
  if (error) throw error
}

export async function deleteCloudTrade(userId: string, tradeId: string): Promise<void> {
  const { error } = await supabase.from('trades').delete().eq('id', tradeId).eq('user_id', userId)
  if (error) throw error
}

export async function upsertAccount(userId: string, account: Account): Promise<void> {
  const { error } = await supabase.from('user_accounts').upsert({ ...account, user_id: userId })
  if (error) throw error
}

export async function upsertAccounts(userId: string, accounts: Account[]): Promise<void> {
  if (!accounts.length) return
  const { error } = await supabase.from('user_accounts').upsert(accounts.map((a) => ({ ...a, user_id: userId })))
  if (error) throw error
}

export async function deleteCloudAccount(userId: string, accountId: string): Promise<void> {
  const { error } = await supabase.from('user_accounts').delete().eq('id', accountId).eq('user_id', userId)
  if (error) throw error
}

// ---- Account Transactions ----

export async function loadAccountTransactions(userId: string): Promise<AccountTransaction[] | null> {
  const { data, error } = await supabase
    .from('account_transactions')
    .select('*')
    .eq('user_id', userId)
  if (error) return null
  return (data ?? []) as AccountTransaction[]
}

export async function upsertAccountTransactions(userId: string, txs: AccountTransaction[]): Promise<void> {
  if (!txs.length) return
  const { error } = await supabase.from('account_transactions').upsert(
    txs.map((t) => ({ ...t, user_id: userId }))
  )
  if (error) throw error
}

export async function deleteCloudAccountTransaction(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('account_transactions').delete().eq('id', id).eq('user_id', userId)
  if (error) throw error
}

// ---- Risk Rules ----

export async function loadRiskRules(userId: string): Promise<RiskRules | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('risk_rules')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data.risk_rules as RiskRules
}

export async function upsertRiskRules(userId: string, rules: RiskRules): Promise<void> {
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    risk_rules: rules,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}
