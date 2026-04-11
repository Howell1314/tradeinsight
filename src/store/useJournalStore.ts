import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { loadCloudJournal, upsertJournalEntry, deleteJournalEntry } from '../lib/syncTrades'

export interface JournalEntry {
  id: string
  date: string
  summary: string
  went_well: string
  improve: string
  plan: string
  pnl: number
  emotion: string
  tags: string[]
  images?: string[]
  review?: string
  updated_at?: string
}

const ALLOWED_EMOTIONS = ['冷静', '自信', '犹豫', '冲动']

function isValidEntry(e: unknown): e is JournalEntry {
  if (!e || typeof e !== 'object') return false
  const entry = e as Record<string, unknown>
  return (
    typeof entry.id === 'string' && entry.id.length <= 64 &&
    typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    typeof entry.summary === 'string' && entry.summary.length <= 5000 &&
    typeof entry.went_well === 'string' && entry.went_well.length <= 5000 &&
    typeof entry.improve === 'string' && entry.improve.length <= 5000 &&
    typeof entry.plan === 'string' && entry.plan.length <= 5000 &&
    typeof entry.pnl === 'number' && isFinite(entry.pnl) &&
    typeof entry.emotion === 'string' && ALLOWED_EMOTIONS.includes(entry.emotion) &&
    Array.isArray(entry.tags) && entry.tags.every((t) => typeof t === 'string' && t.length <= 50) &&
    (!entry.images || (Array.isArray(entry.images) && entry.images.length <= 10 &&
      entry.images.every((url: unknown) => typeof url === 'string' && url.length <= 600))) &&
    (!entry.review || (typeof entry.review === 'string' && entry.review.length <= 10000))
  )
}

interface JournalStore {
  entries: JournalEntry[]
  cloudLoaded: boolean

  addEntry: (entry: JournalEntry, userId?: string | null) => void
  updateEntry: (entry: JournalEntry, userId?: string | null) => void
  deleteEntry: (id: string, userId?: string | null) => void
  /** Load cloud journal on login. Merges local and cloud by updated_at (last-write-wins). */
  syncFromCloud: (userId: string) => Promise<void>
  /** Clear journal on logout */
  clearJournal: () => void
}

function stamp(entry: JournalEntry): JournalEntry {
  return { ...entry, updated_at: new Date().toISOString() }
}

export const useJournalStore = create<JournalStore>()(
  persist(
    (set, get) => ({
      entries: [],
      cloudLoaded: false,

      addEntry: (entry, userId) => {
        const stamped = stamp(entry)
        set((s) => ({ entries: [stamped, ...s.entries] }))
        if (userId) void upsertJournalEntry(userId, { ...stamped, images: stamped.images ?? [], review: stamped.review ?? '' })
      },

      updateEntry: (entry, userId) => {
        const stamped = stamp(entry)
        set((s) => ({ entries: s.entries.map((e) => e.id === stamped.id ? stamped : e) }))
        if (userId) void upsertJournalEntry(userId, { ...stamped, images: stamped.images ?? [], review: stamped.review ?? '' })
      },

      deleteEntry: (id, userId) => {
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }))
        if (userId) void deleteJournalEntry(userId, id)
      },

      syncFromCloud: async (userId) => {
        if (get().cloudLoaded) return
        const cloudEntries = await loadCloudJournal(userId)
        if (!cloudEntries) return

        const valid = cloudEntries.filter(isValidEntry)
        const localEntries = get().entries

        if (valid.length === 0 && localEntries.length > 0) {
          // Nothing on cloud yet — push all local entries
          for (const e of localEntries) {
            void upsertJournalEntry(userId, { ...e, images: e.images ?? [], review: e.review ?? '' })
          }
          set({ cloudLoaded: true })
          return
        }

        // Merge: last-write-wins by updated_at; entries with no updated_at treat cloud as newer
        const localMap = new Map<string, JournalEntry>()
        for (const e of localEntries) localMap.set(e.id, e)

        const toUpsertToCloud: JournalEntry[] = []
        const merged = new Map<string, JournalEntry>()

        // Start with all local entries
        for (const e of localEntries) merged.set(e.id, e)

        // Merge cloud entries
        for (const cloudEntry of valid) {
          const local = localMap.get(cloudEntry.id)
          if (!local) {
            merged.set(cloudEntry.id, cloudEntry) // cloud-only
          } else {
            const cloudTime = cloudEntry.updated_at ?? ''
            const localTime = local.updated_at ?? ''
            if (localTime > cloudTime) {
              // local is newer — keep local, push to cloud
              toUpsertToCloud.push(local)
            } else {
              merged.set(cloudEntry.id, cloudEntry) // cloud is newer or equal
            }
          }
        }

        if (toUpsertToCloud.length > 0) {
          for (const e of toUpsertToCloud) {
            void upsertJournalEntry(userId, { ...e, images: e.images ?? [], review: e.review ?? '' })
          }
        }

        const mergedEntries = Array.from(merged.values()).sort((a, b) => b.date.localeCompare(a.date))
        set({ entries: mergedEntries, cloudLoaded: true })
      },

      clearJournal: () => set({ entries: [], cloudLoaded: false }),
    }),
    {
      name: 'tradeinsight-journal',
      partialize: (s) => ({ entries: s.entries }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.entries = Array.isArray(state.entries) ? state.entries.filter(isValidEntry) : []
        }
      },
    },
  ),
)
