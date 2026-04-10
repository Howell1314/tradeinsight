import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars not set — auth features disabled')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
)

export async function uploadJournalImage(userId: string, file: File): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('journal-images').upload(path, file, { upsert: false })
  if (error) return null
  const { data } = supabase.storage.from('journal-images').getPublicUrl(path)
  return data.publicUrl
}

export async function getRegistrationOpen(): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'registration_open')
      .single()
    if (data == null) return true
    return data.value as boolean
  } catch {
    return true // fail-open: if table doesn't exist yet, allow registration
  }
}

export async function setRegistrationOpen(open: boolean): Promise<string | null> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'registration_open', value: open, updated_at: new Date().toISOString() })
  return error?.message ?? null
}

export interface Profile {
  id: string
  nickname: string
  phone: string
  bio: string
  avatar_url: string
  updated_at: string
}
