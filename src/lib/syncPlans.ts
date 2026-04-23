import { supabase } from './supabase'
import type { TradePlan } from '../types/plan'

// trade_plans 表的云端 CRUD
// 遵循 v2.3 约定：
// - .catch(console.error) 在调用方负责
// - maybeSingle() 用于可能不存在的单行查询
// - last-write-wins 由 updated_at 字段决定

export async function loadCloudPlans(userId: string): Promise<TradePlan[] | null> {
  const { data, error } = await supabase
    .from('trade_plans')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) {
    console.error('[syncPlans] loadCloudPlans failed', error)
    return null
  }
  return (data ?? []) as TradePlan[]
}

export async function upsertPlan(userId: string, plan: TradePlan): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('trade_plans')
    .upsert({ ...plan, user_id: userId, updated_at: plan.updated_at ?? now })
  if (error) throw error
}

export async function upsertPlans(userId: string, plans: TradePlan[]): Promise<void> {
  if (!plans.length) return
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('trade_plans')
    .upsert(plans.map((p) => ({ ...p, user_id: userId, updated_at: p.updated_at ?? now })))
  if (error) throw error
}

export async function deleteCloudPlan(userId: string, planId: string): Promise<void> {
  const { error } = await supabase
    .from('trade_plans')
    .delete()
    .eq('id', planId)
    .eq('user_id', userId)
  if (error) throw error
}

// last-write-wins 合并：按 id 取 updated_at 较新的一份
export function mergePlans(local: TradePlan[], cloud: TradePlan[]): TradePlan[] {
  const map = new Map<string, TradePlan>()
  for (const p of cloud) map.set(p.id, p)
  for (const p of local) {
    const existing = map.get(p.id)
    if (!existing) {
      map.set(p.id, p)
      continue
    }
    const localTs = Date.parse(p.updated_at || p.created_at || '')
    const cloudTs = Date.parse(existing.updated_at || existing.created_at || '')
    if (Number.isFinite(localTs) && localTs > cloudTs) {
      map.set(p.id, p)
    }
  }
  return Array.from(map.values())
}
