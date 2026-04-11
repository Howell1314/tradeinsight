import { supabase } from './supabase'
import type { Trade, Account } from '../types/trade'

// ---- Journal entries ----
export interface JournalEntryDB {
  id: string; user_id?: string; date: string; summary: string
  went_well: string; improve: string; plan: string; pnl: number
  emotion: string; tags: string[]; images: string[]; review: string
}

export async function loadCloudJournal(userId: string): Promise<JournalEntryDB[] | null> {
  const { data, error } = await supabase.from('journal_entries').select('*').eq('user_id', userId).order('date', { ascending: false })
  if (error) return null
  return data as JournalEntryDB[]
}

export async function upsertJournalEntry(userId: string, entry: Omit<JournalEntryDB, 'user_id'>): Promise<void> {
  await supabase.from('journal_entries').upsert({ ...entry, user_id: userId, updated_at: new Date().toISOString() })
}

export async function deleteJournalEntry(userId: string, entryId: string): Promise<void> {
  await supabase.from('journal_entries').delete().eq('id', entryId).eq('user_id', userId)
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
  await supabase.from('trades').upsert({ ...trade, user_id: userId, updated_at: trade.updated_at ?? now })
}

export async function upsertTrades(userId: string, trades: Trade[]): Promise<void> {
  if (!trades.length) return
  const now = new Date().toISOString()
  await supabase.from('trades').upsert(
    trades.map((t) => ({ ...t, user_id: userId, updated_at: t.updated_at ?? now }))
  )
}

export async function deleteCloudTrade(userId: string, tradeId: string): Promise<void> {
  await supabase.from('trades').delete().eq('id', tradeId).eq('user_id', userId)
}

export async function upsertAccount(userId: string, account: Account): Promise<void> {
  await supabase.from('user_accounts').upsert({ ...account, user_id: userId })
}

export async function upsertAccounts(userId: string, accounts: Account[]): Promise<void> {
  if (!accounts.length) return
  await supabase.from('user_accounts').upsert(accounts.map((a) => ({ ...a, user_id: userId })))
}

export async function deleteCloudAccount(userId: string, accountId: string): Promise<void> {
  await supabase.from('user_accounts').delete().eq('id', accountId).eq('user_id', userId)
}
