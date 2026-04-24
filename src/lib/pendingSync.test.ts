import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  trackSync,
  flushPendingSync,
  addSyncErrorListener,
  notifySyncError,
  catchSync,
} from './pendingSync'

describe('pendingSync', () => {
  beforeEach(() => {
    // Drain any leftover pending from previous tests so state is isolated.
    return flushPendingSync()
  })

  describe('trackSync + flushPendingSync', () => {
    it('resolves immediately when no ops are in flight', async () => {
      const start = Date.now()
      await flushPendingSync()
      expect(Date.now() - start).toBeLessThan(50)
    })

    it('awaits an in-flight promise before returning', async () => {
      let resolved = false
      const slow = new Promise<void>((r) =>
        setTimeout(() => { resolved = true; r() }, 20),
      )
      trackSync(slow)

      await flushPendingSync()
      expect(resolved).toBe(true)
    })

    it('awaits all parallel in-flight promises', async () => {
      const order: number[] = []
      trackSync(new Promise<void>((r) => setTimeout(() => { order.push(1); r() }, 30)))
      trackSync(new Promise<void>((r) => setTimeout(() => { order.push(2); r() }, 10)))
      trackSync(new Promise<void>((r) => setTimeout(() => { order.push(3); r() }, 20)))

      await flushPendingSync()
      expect(order).toEqual([2, 3, 1])
    })

    it('does not reject even if a tracked promise rejects', async () => {
      const bad = Promise.reject(new Error('boom'))
      trackSync(bad).catch(() => {}) // caller handles its own .catch

      await expect(flushPendingSync()).resolves.toBeUndefined()
    })

    it('removes ops from pending set after they settle', async () => {
      const p1 = trackSync(Promise.resolve('ok'))
      await p1
      // Nothing pending → flush returns immediately
      const start = Date.now()
      await flushPendingSync()
      expect(Date.now() - start).toBeLessThan(10)
    })
  })

  describe('sync error channel', () => {
    it('addSyncErrorListener receives notifySyncError events', () => {
      const spy = vi.fn()
      const off = addSyncErrorListener(spy)
      notifySyncError(new Error('schema gone'), 'addTrade')

      expect(spy).toHaveBeenCalledOnce()
      const evt = spy.mock.calls[0][0]
      expect(evt.label).toBe('addTrade')
      expect(evt.error).toBeInstanceOf(Error)
      expect((evt.error as Error).message).toBe('schema gone')
      expect(typeof evt.at).toBe('number')
      off()
    })

    it('returned unsubscribe function actually unsubscribes', () => {
      const spy = vi.fn()
      const off = addSyncErrorListener(spy)
      off()
      notifySyncError(new Error('x'), 'y')
      expect(spy).not.toHaveBeenCalled()
    })

    it('multiple listeners all receive the event', () => {
      const a = vi.fn()
      const b = vi.fn()
      const offA = addSyncErrorListener(a)
      const offB = addSyncErrorListener(b)
      notifySyncError({ code: 'PGRST204' }, 'loadCloudData.trades')

      expect(a).toHaveBeenCalledOnce()
      expect(b).toHaveBeenCalledOnce()
      offA(); offB()
    })

    it('catchSync returns a .catch handler that logs AND fires the event', async () => {
      const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
      const spy = vi.fn()
      const off = addSyncErrorListener(spy)

      await Promise.reject(new Error('PGRST204')).catch(catchSync('upsertTrade'))

      expect(consoleErr).toHaveBeenCalled()
      expect(spy).toHaveBeenCalledOnce()
      expect(spy.mock.calls[0][0].label).toBe('upsertTrade')
      expect((spy.mock.calls[0][0].error as Error).message).toBe('PGRST204')

      off()
      consoleErr.mockRestore()
    })
  })

  describe('integration: trackSync + catchSync + flush', () => {
    it('a failed tracked op still flushes cleanly and emits an error event', async () => {
      const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
      const spy = vi.fn()
      const off = addSyncErrorListener(spy)

      const bad = Promise.reject(new Error('401'))
      trackSync(bad).catch(catchSync('addTrade'))

      await flushPendingSync()

      expect(spy).toHaveBeenCalledOnce()
      expect(spy.mock.calls[0][0].label).toBe('addTrade')

      off()
      consoleErr.mockRestore()
    })
  })
})
