// Tracks in-flight cloud writes so we can flush them before invalidating the
// auth session. Without this, a user who closes a trade and immediately logs
// out can lose that write: signOut() invalidates the JWT before the fire-and-
// forget upsert reaches Supabase, the upsert gets rejected by RLS, and the
// .catch swallows the error while clearUserData wipes the local copy.
//
// Also exposes a sync-error event channel so App.tsx can surface any silent
// cloud failure as a red banner — see .learnings/schema-drift-silent-postgrest-
// errors.md for why silent failure is the default hazard with supabase-js.

const pendingOps = new Set<Promise<unknown>>()

export function trackSync<T>(promise: Promise<T>): Promise<T> {
  const wrapped: Promise<T> = promise.finally(() => {
    pendingOps.delete(wrapped as Promise<unknown>)
  })
  pendingOps.add(wrapped as Promise<unknown>)
  return wrapped
}

export async function flushPendingSync(): Promise<void> {
  if (pendingOps.size === 0) return
  await Promise.allSettled(Array.from(pendingOps))
}

// ─── sync-error event channel ─────────────────────────────────────────────

export interface SyncErrorEvent {
  label: string
  error: unknown
  at: number
}

const errorListeners = new Set<(e: SyncErrorEvent) => void>()

export function addSyncErrorListener(fn: (e: SyncErrorEvent) => void): () => void {
  errorListeners.add(fn)
  return () => { errorListeners.delete(fn) }
}

export function notifySyncError(error: unknown, label: string): void {
  const evt: SyncErrorEvent = { label, error, at: Date.now() }
  for (const fn of errorListeners) fn(evt)
}

/** Drop-in replacement for `.catch(e => console.error('[sync] X failed', e))`. */
export function catchSync(label: string): (err: unknown) => void {
  return (err) => {
    console.error(`[sync] ${label} failed`, err)
    notifySyncError(err, label)
  }
}
