import { describe, it, expect } from 'vitest'

describe('vitest smoke', () => {
  it('framework works', () => {
    expect(1 + 1).toBe(2)
  })

  it('can import from types/plan', async () => {
    const mod = await import('../types/plan')
    expect(mod.PLAN_STATUS_LABELS).toBeDefined()
    expect(mod.RESONANCE_LAYER_LABELS).toBeDefined()
    expect(Object.keys(mod.RESONANCE_LAYER_LABELS)).toHaveLength(5)
  })
})
