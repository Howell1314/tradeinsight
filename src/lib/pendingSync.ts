// Tracks in-flight cloud writes so we can flush them before invalidating the
// auth session. Without this, a user who closes a trade and immediately logs
// out can lose that write: signOut() invalidates the JWT before the fire-and-
// forget upsert reaches Supabase, the upsert gets rejected by RLS, and the
// .catch swallows the error while clearUserData wipes the local copy.

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
