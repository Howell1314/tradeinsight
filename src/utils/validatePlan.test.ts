import { describe, it, expect } from 'vitest'
import type { TradePlan, PlanCandidate, MarketContext } from '../types/plan'
import { validatePlan } from './validatePlan'

// ─── factories ─────────────────────────────────

function makeCandidate(overrides: Partial<PlanCandidate> = {}): PlanCandidate {
  return {
    id: 'c1',
    name: 'Test Candidate',
    strategy_type: 'test',
    entry_low: 100,
    entry_high: 105,
    planned_stop: 95,
    planned_targets: [110],
    position_sizing: { type: 'capital_pct', percentage: 20, capital_reference: 10000 },
    expected_max_loss: 100,
    expected_max_loss_pct: 1,
    ...overrides,
  }
}

function makeMarketContext(overrides: Partial<MarketContext> = {}): MarketContext {
  return {
    market_trend_short: 'bull',
    market_trend_medium: 'bull',
    hot_sectors: [],
    hot_stocks: [],
    trend_long: 'up',
    trend_medium: 'up',
    trend_short: 'up',
    ...overrides,
  }
}

function makeSubjectivePlan(overrides: Partial<TradePlan> = {}): TradePlan {
  return {
    id: 'p1',
    user_id: 'u1',
    account_id: 'a1',
    asset_class: 'equity',
    symbol: 'TEST',
    direction: 'long',
    plan_mode: 'full',
    status: 'draft',
    effective_from: '2026-04-24',
    effective_until: '2026-05-01',
    primary_goal: 'steady_profit',
    market_context: makeMarketContext(),
    asset_specifics: { asset_class: 'equity', uses_margin: false },
    candidates: [makeCandidate()],
    legs: [],
    confidence: {
      mode: 'subjective',
      subjective_score: 4,
      subjective_reason: '至少十字的理由填写说明',
      final_score: 4,
    },
    entry_rationale: '这是至少 20 字的入场逻辑填写内容测试说明',
    strategy_tags: [],
    fund_attribute: 'principal',
    timeline: [],
    daily_entries: [],
    created_at: '2026-04-24T00:00:00Z',
    updated_at: '2026-04-24T00:00:00Z',
    ...overrides,
  }
}

function makeResonancePlan(overrides: Partial<TradePlan> = {}): TradePlan {
  return makeSubjectivePlan({
    market_context: makeMarketContext({
      market_sentiment: {
        source: 'fear_greed_cnn',
        bucket: 'extreme_fear',
      },
      price_structure: {
        signal_type: 'support_hold',
        observed_at: '2026-04-24',
        confidence: 'strong',
      },
    }),
    candidates: [makeCandidate({
      strategy_structure: { structure_type: 'long_stock', match_score: 'high' },
      sizing_rationale: '按共振度 5 + 本金档位 1/3 原则',
    })],
    confidence: {
      mode: 'resonance',
      subjective_reason: '综合 5 层判断达标',
      final_score: 5,
      symbol_familiarity: 5,
    },
    ...overrides,
  })
}

function hasError(errs: ReturnType<typeof validatePlan>, fieldSubstring: string): boolean {
  return errs.some((e) => e.field.includes(fieldSubstring))
}

// ─── subjective mode（向后兼容） ─────────────

describe('validatePlan (subjective mode)', () => {
  it('合法的最小 subjective plan → 无错', () => {
    expect(validatePlan(makeSubjectivePlan())).toEqual([])
  })

  it('subjective_score 缺失 → 报错', () => {
    const plan = makeSubjectivePlan({
      confidence: {
        mode: 'subjective',
        subjective_reason: '至少十字的理由填写说明',
        final_score: 0,
      },
    })
    const errs = validatePlan(plan)
    expect(hasError(errs, 'confidence.subjective_score')).toBe(true)
  })

  it('subjective_reason 过短 → 报错', () => {
    const plan = makeSubjectivePlan({
      confidence: {
        mode: 'subjective',
        subjective_score: 3,
        subjective_reason: '短',
        final_score: 3,
      },
    })
    const errs = validatePlan(plan)
    expect(hasError(errs, 'confidence.subjective_reason')).toBe(true)
  })

  it('subjective 模式下不触发任何 resonance 专属错（market_sentiment / symbol_familiarity 缺失也 pass）', () => {
    const plan = makeSubjectivePlan() // 默认没有 market_sentiment、symbol_familiarity
    const errs = validatePlan(plan)
    expect(hasError(errs, 'symbol_familiarity')).toBe(false)
    expect(hasError(errs, 'market_sentiment')).toBe(false)
    expect(hasError(errs, 'price_structure')).toBe(false)
    expect(errs).toEqual([])
  })
})

// ─── resonance mode（新校验） ────────────────

describe('validatePlan (resonance mode)', () => {
  it('合法的完整 resonance plan → 无错', () => {
    expect(validatePlan(makeResonancePlan())).toEqual([])
  })

  it('symbol_familiarity 缺失 → 报错（"必填"）', () => {
    const plan = makeResonancePlan({
      confidence: {
        mode: 'resonance',
        subjective_reason: '综合判断',
        final_score: 0,
      },
    })
    const errs = validatePlan(plan)
    expect(hasError(errs, 'confidence.symbol_familiarity')).toBe(true)
    expect(errs.find((e) => e.field === 'confidence.symbol_familiarity')?.message).toContain('必填')
  })

  it('symbol_familiarity = 0 → 报错（范围外）', () => {
    const plan = makeResonancePlan()
    ;(plan.confidence as unknown as { symbol_familiarity: unknown }).symbol_familiarity = 0
    const errs = validatePlan(plan)
    expect(errs.find((e) => e.field === 'confidence.symbol_familiarity')?.message).toContain('1 到 5')
  })

  it('symbol_familiarity = 6 → 报错', () => {
    const plan = makeResonancePlan()
    ;(plan.confidence as unknown as { symbol_familiarity: unknown }).symbol_familiarity = 6
    expect(hasError(validatePlan(plan), 'confidence.symbol_familiarity')).toBe(true)
  })

  it('symbol_familiarity = 2.5（小数）→ 报错', () => {
    const plan = makeResonancePlan()
    ;(plan.confidence as unknown as { symbol_familiarity: unknown }).symbol_familiarity = 2.5
    expect(hasError(validatePlan(plan), 'confidence.symbol_familiarity')).toBe(true)
  })

  it('symbol_familiarity = 字符串 → 报错', () => {
    const plan = makeResonancePlan()
    ;(plan.confidence as unknown as { symbol_familiarity: unknown }).symbol_familiarity = 'invalid'
    expect(hasError(validatePlan(plan), 'confidence.symbol_familiarity')).toBe(true)
  })

  it('market_sentiment 缺失 → 报错', () => {
    const plan = makeResonancePlan({
      market_context: makeMarketContext({
        price_structure: {
          signal_type: 'support_hold',
          observed_at: '2026-04-24',
          confidence: 'strong',
        },
      }),
    })
    const errs = validatePlan(plan)
    expect(errs.find((e) => e.field === 'market_context.market_sentiment')?.message).toContain('必填')
  })

  it('market_sentiment.bucket 非法 → 报错', () => {
    const plan = makeResonancePlan()
    ;(plan.market_context as unknown as { market_sentiment: { bucket: unknown } })
      .market_sentiment.bucket = 'euphoria'
    expect(hasError(validatePlan(plan), 'market_context.market_sentiment.bucket')).toBe(true)
  })

  it('market_sentiment.raw_value 越界 → 报错', () => {
    const plan = makeResonancePlan({
      market_context: makeMarketContext({
        market_sentiment: {
          source: 'fear_greed_cnn',
          bucket: 'extreme_fear',
          raw_value: 150,
        },
        price_structure: {
          signal_type: 'support_hold',
          observed_at: '2026-04-24',
          confidence: 'strong',
        },
      }),
    })
    expect(hasError(validatePlan(plan), 'market_context.market_sentiment.raw_value')).toBe(true)
  })

  it('market_sentiment.percentile_2y 越界 → 报错', () => {
    const plan = makeResonancePlan({
      market_context: makeMarketContext({
        market_sentiment: {
          source: 'fear_greed_cnn',
          bucket: 'extreme_fear',
          percentile_2y: 1.5,
        },
        price_structure: {
          signal_type: 'support_hold',
          observed_at: '2026-04-24',
          confidence: 'strong',
        },
      }),
    })
    expect(hasError(validatePlan(plan), 'market_context.market_sentiment.percentile_2y')).toBe(true)
  })

  it('price_structure.signal_type 非法 → 报错', () => {
    const plan = makeResonancePlan()
    ;(plan.market_context as unknown as { price_structure: { signal_type: unknown } })
      .price_structure.signal_type = 'cup_and_handle'
    expect(hasError(validatePlan(plan), 'market_context.price_structure.signal_type')).toBe(true)
  })

  it('price_structure.confidence 非法 → 报错', () => {
    const plan = makeResonancePlan()
    ;(plan.market_context as unknown as { price_structure: { confidence: unknown } })
      .price_structure.confidence = 'bulletproof'
    expect(hasError(validatePlan(plan), 'market_context.price_structure.confidence')).toBe(true)
  })

  it('price_structure.observed_at 无效日期字符串 → 报错', () => {
    const plan = makeResonancePlan()
    ;(plan.market_context as unknown as { price_structure: { observed_at: string } })
      .price_structure.observed_at = 'not-a-date'
    expect(hasError(validatePlan(plan), 'market_context.price_structure.observed_at')).toBe(true)
  })

  it('strategy_structure.structure_type 非法 → 报错', () => {
    const plan = makeResonancePlan({
      candidates: [makeCandidate({
        strategy_structure: {
          // @ts-expect-error 故意传非枚举值测试 runtime 校验
          structure_type: 'voodoo',
          match_score: 'high',
        },
        sizing_rationale: '有理由',
      })],
    })
    expect(hasError(validatePlan(plan), 'strategy_structure.structure_type')).toBe(true)
  })

  it('strategy_structure.match_score 非法 → 报错', () => {
    const plan = makeResonancePlan({
      candidates: [makeCandidate({
        strategy_structure: {
          structure_type: 'long_stock',
          // @ts-expect-error 故意传非枚举值
          match_score: 'extreme',
        },
        sizing_rationale: '有理由',
      })],
    })
    expect(hasError(validatePlan(plan), 'strategy_structure.match_score')).toBe(true)
  })

  it('sizing_rationale 全空格 → 报错', () => {
    const plan = makeResonancePlan({
      candidates: [makeCandidate({
        strategy_structure: { structure_type: 'long_stock', match_score: 'high' },
        sizing_rationale: '   ',
      })],
    })
    expect(hasError(validatePlan(plan), 'sizing_rationale')).toBe(true)
  })

  it('sizing_rationale 未填（undefined）→ 不报错（仅存在时校验）', () => {
    const plan = makeResonancePlan({
      candidates: [makeCandidate({
        strategy_structure: { structure_type: 'long_stock', match_score: 'high' },
      })],
    })
    expect(hasError(validatePlan(plan), 'sizing_rationale')).toBe(false)
  })
})
