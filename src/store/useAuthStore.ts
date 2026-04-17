import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/supabase'

interface AuthStore {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  initialized: boolean

  init: () => Promise<void>
  signUp: (email: string, password: string) => Promise<string | null>
  signIn: (email: string, password: string) => Promise<string | null>
  signInWithGoogle: () => Promise<string | null>
  signOut: () => Promise<void>
  fetchProfile: () => Promise<void>
  updateProfile: (updates: Partial<Omit<Profile, 'id' | 'updated_at'>>) => Promise<string | null>
  uploadAvatar: (file: File) => Promise<string | null>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: false,
  initialized: false,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set({ session, user: session?.user ?? null, initialized: true })
    if (session?.user) get().fetchProfile()

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null })
      if (session?.user) get().fetchProfile()
      else set({ profile: null })
    })
  },

  signUp: async (email, password) => {
    set({ loading: true })
    const { error } = await supabase.auth.signUp({ email, password })
    set({ loading: false })
    return error?.message ?? null
  },

  signIn: async (email, password) => {
    set({ loading: true })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    set({ loading: false })
    return error?.message ?? null
  },

  signInWithGoogle: async () => {
    set({ loading: true })
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    set({ loading: false })
    return error?.message ?? null
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, profile: null })
    // Trade data is cleared by App.tsx via clearUserData() when user becomes null
  },

  fetchProfile: async () => {
    const { user } = get()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    if (data) set({ profile: data as Profile })
  },

  updateProfile: async (updates) => {
    const { user } = get()
    if (!user) return '未登录'
    const payload = { ...updates, id: user.id, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('profiles').upsert(payload)
    if (!error) {
      set((s) => ({ profile: s.profile ? { ...s.profile, ...updates } : (payload as Profile) }))
    }
    return error?.message ?? null
  },

  uploadAvatar: async (file) => {
    const { user } = get()
    if (!user) return null
    const ext = file.name.split('.').pop()
    const path = `${user.id}/avatar.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const url = data.publicUrl + `?t=${Date.now()}`
    await get().updateProfile({ avatar_url: url })
    return url
  },
}))
