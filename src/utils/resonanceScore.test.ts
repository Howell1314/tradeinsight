import { describe, it, expect } from 'vitest'
import type { TradePlan, PlanCandidate, MarketContext } from '../types/plan'
import {
  computeResonanceScore,
  classifyFearGreedBucket,
  evaluateFundAttributeFit,
  shouldAutoDraft,
} from './resonanceScore'

// ─── factories ────────────────────────────────────────

function makeCandidate(overrides: Partial<PlanCandidate> = {}): PlanCandidate {
  return {
    id: 'c1',
    name: 'Test Candidate',
    strategy_type: 'test',
    entry_low: 100,
    entry_high: 105,
    planned_stop: 95,
    planned_targets: [110, 115],
    position_sizing: { type: 'capital_pct', percentage: 20, capital_reference: 10000 },
    expected_max_loss: 100,
    expected_max_loss_pct: 1,
    strategy_structure: {
      structure_type: 'long_stock',
      match_score: 'high',
    },
    sizing_rationale: '按原则定 20%',
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
    market_sentiment: {
      source: 'fear_greed_cnn',
      bucket: 'extreme_fear',
    },
    price_structure: {
      signal_type: 'support_hold',
      observed_at: '2026-04-24',
      confidence: 'strong',
    },
    ...overrides,
  }
}

function makePlan(overrides: Partial<TradePlan> = {}): TradePlan {
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
      mode: 'resonance',
      subjective_reason: '',
      final_score: 0,
      symbol_familiarity: 5,
    },
    entry_rationale: 'test rationale',
    strategy_tags: [],
    fund_attribute: 'principal',
    timeline: [],
    daily_entries: [],
    created_at: '2026-04-24T00:00:00Z',
    updated_at: '2026-04-24T00:00:00Z',
    ...overrides,
  }
}

function withBreakdown(plan: TradePlan, total: 0 | 1 | 2 | 3 | 4 | 5): TradePlan {
  return {
    ...plan,
    confidence: {
      ...plan.confidence,
      resonance_breakdown: {
        price_structure: (total >= 1 ? 1 : 0) as 0 | 1,
        sentiment: (total >= 2 ? 1 : 0) as 0 | 1,
        familiarity: (total >= 3 ? 1 : 0) as 0 | 1,
        strategy_fit: (total >= 4 ? 1 : 0) as 0 | 1,
        sizing_fit: (total >= 5 ? 1 : 0) as 0 | 1,
        total,
        blockers: [],
        computed_at: '2026-04-24T00:00:00Z',
      },
    },
  }
}

// ─── computeResonanceScore ────────────────────────────

describe('computeResonanceScore', () => {
  it('5 层全达标 → total=5, blockers=[]', () => {
    const bd = computeResonanceScore(makePlan())
    expect(bd).not.toBeNull()
    expect(bd!.total).toBe(5)
    expect(bd!.price_structure).toBe(1)
    expect(bd!.sentiment).toBe(1)
    expect(bd!.familiarity).toBe(1)
    expect(bd!.strategy_fit).toBe(1)
    expect(bd!.sizing_fit).toBe(1)
    expect(bd!.blockers).toEqual([])
    expect(bd!.computed_at).toBeTruthy()
  })

  it('price_structure 缺失 → total=4, 仅该层 blocker', () => {
    const plan = makePlan({
      market_context: makeMarketContext({ price_structure: undefined }),
    })
    const bd = computeResonanceScore(plan)!
    expect(bd.price_structure).toBe(0)
    expect(bd.total).toBe(4)
    expect(bd.blockers).toHaveLength(1)
    expect(bd.blockers[0]).toContain('价格结构')
  })

  it('sentiment neutral → total=4, 仅该层 blocker', () => {
    const plan = makePlan({
      market_context: makeMarketContext({
        market_sentiment: { source: 'fear_greed_cnn', bucket: 'neutral' },
      }),
    })
    const bd = computeResonanceScore(plan)!
    expect(bd.sentiment).toBe(0)
    expect(bd.total).toBe(4)
    expect(bd.blockers).toHaveLength(1)
    expect(bd.blockers[0]).toContain('极值')
  })

  it('familiarity=3 → total=4, 仅该层 blocker', () => {
    const plan = makePlan({
      confidence: {
        mode: 'resonance',
        subjective_reason: '',
        final_score: 0,
        symbol_familiarity: 3,
      },
    })
    const bd = computeResonanceScore(plan)!
    expect(bd.familiarity).toBe(0)
    expect(bd.total).toBe(4)
    expect(bd.blockers).toHaveLength(1)
    expect(bd.blockers[0]).toContain('熟悉度')
  })

  it('strategy_fit match_score=low → total=4', () => {
    const plan = makePlan({
      candidates: [makeCandidate({
        strategy_structure: { structure_type: 'long_stock', match_score: 'low' },
      })],
    })
    const bd = computeResonanceScore(plan)!
    expect(bd.strategy_fit).toBe(0)
    expect(bd.total).toBe(4)
  })

  it('sizing_fit 缺 sizing_rationale → total=4', () => {
    const plan = makePlan({
      candidates: [makeCandidate({ sizing_rationale: '' })],
    })
    const bd = computeResonanceScore(plan)!
    expect(bd.sizing_fit).toBe(0)
    expect(bd.total).toBe(4)
  })

  it('2 层未达标 → total=3', () => {
    const plan = makePlan({
      market_context: makeMarketContext({
        market_sentiment: { source: 'fear_greed_cnn', bucket: 'neutral' },
        price_structure: undefined,
      }),
    })
    const bd = computeResonanceScore(plan)!
    expect(bd.total).toBe(3)
    expect(bd.blockers).toHaveLength(2)
  })

  it('全未达标 → total=0, blockers 长度=5', () => {
    const plan = makePlan({
      market_context: {
        market_trend_short: 'uncertain',
        market_trend_medium: 'uncertain',
        hot_sectors: [],
        hot_stocks: [],
        trend_long: 'range',
        trend_medium: 'range',
        trend_short: 'range',
      },
      candidates: [],
      confidence: {
        mode: 'resonance',
        subjective_reason: '',
        final_score: 0,
        symbol_familiarity: 1,
      },
    })
    const bd = computeResonanceScore(plan)!
    expect(bd.total).toBe(0)
    expect(bd.blockers).toHaveLength(5)
  })

  it('subjective 模式 → null', () => {
    const plan = makePlan({
      confidence: {
        mode: 'subjective',
        subjective_score: 3,
        subjective_reason: '',
        final_score: 3,
      },
    })
    expect(computeResonanceScore(plan)).toBeNull()
  })

  it('symbol_familiarity 未填 → null', () => {
    const plan = makePlan({
      confidence: {
        mode: 'resonance',
        subjective_reason: '',
        final_score: 0,
      },
    })
    expect(computeResonanceScore(plan)).toBeNull()
  })
})

// ─── 每层边界 ─────────────────────────────────────────

describe('computeResonanceScore 层边界', () => {
  it('sentiment: fear / greed 都视为 0（严格极值）', () => {
    const mkWith = (bucket: 'fear' | 'greed' | 'extreme_fear' | 'extreme_greed' | 'neutral') =>
      computeResonanceScore(makePlan({
        market_context: makeMarketContext({
          market_sentiment: { source: 'fear_greed_cnn', bucket },
        }),
      }))!.sentiment

    expect(mkWith('fear')).toBe(0)
    expect(mkWith('greed')).toBe(0)
    expect(mkWith('neutral')).toBe(0)
    expect(mkWith('extreme_fear')).toBe(1)
    expect(mkWith('extreme_greed')).toBe(1)
  })

  it('price_structure: range_mid 视为 0', () => {
    const plan = makePlan({
      market_context: makeMarketContext({
        price_structure: {
          signal_type: 'range_mid',
          observed_at: '2026-04-24',
          confidence: 'strong',
        },
      }),
    })
    expect(computeResonanceScore(plan)!.price_structure).toBe(0)
  })

  it('price_structure: confidence=weak 视为 0', () => {
    const plan = makePlan({
      market_context: makeMarketContext({
        price_structure: {
          signal_type: 'support_hold',
          observed_at: '2026-04-24',
          confidence: 'weak',
        },
      }),
    })
    expect(computeResonanceScore(plan)!.price_structure).toBe(0)
  })

  it('familiarity: 3=0, 4=1', () => {
    const mk = (sf: 1 | 2 | 3 | 4 | 5) => computeResonanceScore(makePlan({
      confidence: {
        mode: 'resonance',
        subjective_reason: '',
        final_score: 0,
        symbol_familiarity: sf,
      },
    }))!.familiarity

    expect(mk(3)).toBe(0)
    expect(mk(4)).toBe(1)
  })

  it('strategy_fit: match_score=low 视为 0', () => {
    const plan = makePlan({
      candidates: [makeCandidate({
        strategy_structure: { structure_type: 'long_stock', match_score: 'low' },
      })],
    })
    expect(computeResonanceScore(plan)!.strategy_fit).toBe(0)
  })

  it('strategy_fit: structure_type=other 视为 0', () => {
    const plan = makePlan({
      candidates: [makeCandidate({
        strategy_structure: { structure_type: 'other', match_score: 'high' },
      })],
    })
    expect(computeResonanceScore(plan)!.strategy_fit).toBe(0)
  })

  it('sizing_fit: sizing_rationale 全空格视为 0', () => {
    const plan = makePlan({
      candidates: [makeCandidate({ sizing_rationale: '   ' })],
    })
    expect(computeResonanceScore(plan)!.sizing_fit).toBe(0)
  })

  it('sizing_fit: capital_pct percentage=0 视为 0', () => {
    const plan = makePlan({
      candidates: [makeCandidate({
        position_sizing: { type: 'capital_pct', percentage: 0, capital_reference: 10000 },
      })],
    })
    const bd = computeResonanceScore(plan)!
    expect(bd.sizing_fit).toBe(0)
    expect(bd.total).toBe(4)
  })

  it('sizing_fit: capital_pct percentage=NaN 视为 0', () => {
    const plan = makePlan({
      candidates: [makeCandidate({
        position_sizing: { type: 'capital_pct', percentage: NaN, capital_reference: 10000 },
      })],
    })
    const bd = computeResonanceScore(plan)!
    expect(bd.sizing_fit).toBe(0)
    expect(bd.total).toBe(4)
  })

  it('sizing_fit: absolute quantity=0 视为 0', () => {
    const plan = makePlan({
      candidates: [makeCandidate({
        position_sizing: { type: 'absolute', quantity: 0 },
      })],
    })
    const bd = computeResonanceScore(plan)!
    expect(bd.sizing_fit).toBe(0)
    expect(bd.total).toBe(4)
  })

  it('sizing_fit: risk_pct risk_percentage=NaN 视为 0', () => {
    const plan = makePlan({
      candidates: [makeCandidate({
        position_sizing: { type: 'risk_pct', risk_percentage: NaN, capital_reference: 10000 },
      })],
    })
    const bd = computeResonanceScore(plan)!
    expect(bd.sizing_fit).toBe(0)
    expect(bd.total).toBe(4)
  })
})

// ─── classifyFearGreedBucket ──────────────────────────

describe('classifyFearGreedBucket', () => {
  it('每档内部值归类正确', () => {
    expect(classifyFearGreedBucket(10)).toBe('extreme_fear')
    expect(classifyFearGreedBucket(35)).toBe('fear')
    expect(classifyFearGreedBucket(50)).toBe('neutral')
    expect(classifyFearGreedBucket(65)).toBe('greed')
    expect(classifyFearGreedBucket(85)).toBe('extreme_greed')
  })

  it('边界值按半开区间处理', () => {
    expect(classifyFearGreedBucket(24)).toBe('extreme_fear')
    expect(classifyFearGreedBucket(25)).toBe('fear')
    expect(classifyFearGreedBucket(44)).toBe('fear')
    expect(classifyFearGreedBucket(45)).toBe('neutral')
    expect(classifyFearGreedBucket(55)).toBe('neutral')
    expect(classifyFearGreedBucket(56)).toBe('greed')
    expect(classifyFearGreedBucket(75)).toBe('greed')
    expect(classifyFearGreedBucket(76)).toBe('extreme_greed')
  })

  it('端点 0 和 100', () => {
    expect(classifyFearGreedBucket(0)).toBe('extreme_fear')
    expect(classifyFearGreedBucket(100)).toBe('extreme_greed')
  })

  it('越界输入 clamp', () => {
    expect(classifyFearGreedBucket(-5)).toBe('extreme_fear')
    expect(classifyFearGreedBucket(105)).toBe('extreme_greed')
  })

  it('NaN / Infinity 兜底 neutral', () => {
    expect(classifyFearGreedBucket(NaN)).toBe('neutral')
    expect(classifyFearGreedBucket(Infinity)).toBe('neutral')
    expect(classifyFearGreedBucket(-Infinity)).toBe('neutral')
  })
})

// ─── evaluateFundAttributeFit ─────────────────────────

describe('evaluateFundAttributeFit', () => {
  it('规则 a：熟悉度=3 + principal → warn', () => {
    const plan = makePlan({
      confidence: {
        mode: 'resonance',
        subjective_reason: '',
        final_score: 0,
        symbol_familiarity: 3,
      },
    })
    const r = evaluateFundAttributeFit(plan, 'principal')
    expect(r.level).toBe('warn')
    expect(r.messages).toHaveLength(1)
    expect(r.messages[0]).toContain('熟悉度')
  })

  it('规则 a：熟悉度=3 + extraordinary_profit → ok（非主力）', () => {
    const plan = makePlan({
      confidence: {
        mode: 'resonance',
        subjective_reason: '',
        final_score: 0,
        symbol_familiarity: 3,
      },
    })
    const r = evaluateFundAttributeFit(plan, 'extraordinary_profit')
    expect(r.level).toBe('ok')
    expect(r.messages).toHaveLength(0)
  })

  it('规则 a：熟悉度=4 + principal → ok（熟悉度达标）', () => {
    const plan = makePlan()
    const r = evaluateFundAttributeFit(plan, 'principal')
    expect(r.level).toBe('ok')
  })

  it('规则 b：total=3 → 只有 b 的 message，不叠加 c', () => {
    const plan = withBreakdown(
      makePlan({
        candidates: [makeCandidate({
          position_sizing: { type: 'capital_pct', percentage: 80, capital_reference: 10000 },
        })],
      }),
      3,
    )
    const r = evaluateFundAttributeFit(plan, 'principal')
    expect(r.level).toBe('warn')
    expect(r.messages).toHaveLength(1)
    expect(r.messages[0]).toContain('共振度')
  })

  it('规则 c 本金子档 total=5 capital_pct=50 → ok（边界不触发）', () => {
    const plan = withBreakdown(
      makePlan({
        candidates: [makeCandidate({
          position_sizing: { type: 'capital_pct', percentage: 50, capital_reference: 10000 },
        })],
      }),
      5,
    )
    const r = evaluateFundAttributeFit(plan, 'principal')
    expect(r.level).toBe('ok')
  })

  it('规则 c 本金子档 total=5 capital_pct=50.1 → warn', () => {
    const plan = withBreakdown(
      makePlan({
        candidates: [makeCandidate({
          position_sizing: { type: 'capital_pct', percentage: 50.1, capital_reference: 10000 },
        })],
      }),
      5,
    )
    const r = evaluateFundAttributeFit(plan, 'principal')
    expect(r.level).toBe('warn')
    expect(r.messages[0]).toContain('50%')
  })

  it('规则 c 本金子档 total=4 capital_pct=25 → ok（边界不触发）', () => {
    const plan = withBreakdown(
      makePlan({
        candidates: [makeCandidate({
          position_sizing: { type: 'capital_pct', percentage: 25, capital_reference: 10000 },
        })],
      }),
      4,
    )
    const r = evaluateFundAttributeFit(plan, 'secondary_profit')
    expect(r.level).toBe('ok')
  })

  it('规则 c 本金子档 total=4 capital_pct=25.1 → warn', () => {
    const plan = withBreakdown(
      makePlan({
        candidates: [makeCandidate({
          position_sizing: { type: 'capital_pct', percentage: 25.1, capital_reference: 10000 },
        })],
      }),
      4,
    )
    const r = evaluateFundAttributeFit(plan, 'principal')
    expect(r.level).toBe('warn')
  })

  it('规则 c 利润子档 total=5 capital_pct=70 → ok（边界不触发）', () => {
    const plan = withBreakdown(
      makePlan({
        candidates: [makeCandidate({
          position_sizing: { type: 'capital_pct', percentage: 70, capital_reference: 10000 },
        })],
      }),
      5,
    )
    const r = evaluateFundAttributeFit(plan, 'long_term_profit')
    expect(r.level).toBe('ok')
  })

  it('规则 c 利润子档 total=5 capital_pct=70.1 → warn', () => {
    const plan = withBreakdown(
      makePlan({
        candidates: [makeCandidate({
          position_sizing: { type: 'capital_pct', percentage: 70.1, capital_reference: 10000 },
        })],
      }),
      5,
    )
    const r = evaluateFundAttributeFit(plan, 'long_term_profit')
    expect(r.level).toBe('warn')
  })

  it('规则 c 利润子档 total=4 capital_pct=41 → warn', () => {
    const plan = withBreakdown(
      makePlan({
        candidates: [makeCandidate({
          position_sizing: { type: 'capital_pct', percentage: 41, capital_reference: 10000 },
        })],
      }),
      4,
    )
    const r = evaluateFundAttributeFit(plan, 'medium_term_profit')
    expect(r.level).toBe('warn')
  })

  it('规则 c 利润 3 档共用同一阈值', () => {
    const buildPlan = () =>
      withBreakdown(
        makePlan({
          candidates: [makeCandidate({
            position_sizing: { type: 'capital_pct', percentage: 41, capital_reference: 10000 },
          })],
        }),
        4,
      )

    expect(evaluateFundAttributeFit(buildPlan(), 'long_term_profit').level).toBe('warn')
    expect(evaluateFundAttributeFit(buildPlan(), 'medium_term_profit').level).toBe('warn')
    expect(evaluateFundAttributeFit(buildPlan(), 'short_term_profit').level).toBe('warn')
  })

  it('规则 c 不触发：absolute 类型任意 quantity', () => {
    const plan = withBreakdown(
      makePlan({
        candidates: [makeCandidate({
          position_sizing: { type: 'absolute', quantity: 99999 },
        })],
      }),
      5,
    )
    const r = evaluateFundAttributeFit(plan, 'principal')
    expect(r.level).toBe('ok')
  })

  it('规则 c 不触发：risk_pct 类型任意百分比', () => {
    const plan = withBreakdown(
      makePlan({
        candidates: [makeCandidate({
          position_sizing: { type: 'risk_pct', risk_percentage: 95, capital_reference: 10000 },
        })],
      }),
      5,
    )
    const r = evaluateFundAttributeFit(plan, 'principal')
    expect(r.level).toBe('ok')
  })

  it('规则 c 不触发：非主力集合（extraordinary/split/passive/tertiary/margin）', () => {
    const buildPlan = () =>
      withBreakdown(
        makePlan({
          candidates: [makeCandidate({
            position_sizing: { type: 'capital_pct', percentage: 95, capital_reference: 10000 },
          })],
        }),
        5,
      )

    expect(evaluateFundAttributeFit(buildPlan(), 'extraordinary_profit').level).toBe('ok')
    expect(evaluateFundAttributeFit(buildPlan(), 'split_profit').level).toBe('ok')
    expect(evaluateFundAttributeFit(buildPlan(), 'passive_profit').level).toBe('ok')
    expect(evaluateFundAttributeFit(buildPlan(), 'tertiary_profit').level).toBe('ok')
    expect(evaluateFundAttributeFit(buildPlan(), 'margin').level).toBe('ok')
  })

  it('规则 a + c 同时触发：messages 有 2 条，a 在前 c 在后', () => {
    const plan = withBreakdown(
      makePlan({
        candidates: [makeCandidate({
          position_sizing: { type: 'capital_pct', percentage: 80, capital_reference: 10000 },
        })],
        confidence: {
          mode: 'resonance',
          subjective_reason: '',
          final_score: 0,
          symbol_familiarity: 3,
        },
      }),
      5,
    )
    const r = evaluateFundAttributeFit(plan, 'principal')
    expect(r.level).toBe('warn')
    expect(r.messages).toHaveLength(2)
    expect(r.messages[0]).toContain('熟悉度')
    expect(r.messages[1]).toContain('仓位')
  })
})

// ─── shouldAutoDraft ──────────────────────────────────

describe('shouldAutoDraft', () => {
  it('total=5 → false', () => {
    expect(shouldAutoDraft(makePlan())).toBe(false)
  })

  it('total=4 → false', () => {
    const plan = makePlan({
      market_context: makeMarketContext({
        market_sentiment: { source: 'fear_greed_cnn', bucket: 'neutral' },
      }),
    })
    expect(shouldAutoDraft(plan)).toBe(false)
  })

  it('total=3 → true', () => {
    const plan = makePlan({
      market_context: makeMarketContext({
        market_sentiment: { source: 'fear_greed_cnn', bucket: 'neutral' },
        price_structure: undefined,
      }),
    })
    expect(shouldAutoDraft(plan)).toBe(true)
  })

  it('total=0 → true', () => {
    const plan = makePlan({
      market_context: {
        market_trend_short: 'uncertain',
        market_trend_medium: 'uncertain',
        hot_sectors: [],
        hot_stocks: [],
        trend_long: 'range',
        trend_medium: 'range',
        trend_short: 'range',
      },
      candidates: [],
      confidence: {
        mode: 'resonance',
        subjective_reason: '',
        final_score: 0,
        symbol_familiarity: 1,
      },
    })
    expect(shouldAutoDraft(plan)).toBe(true)
  })

  it('subjective 模式（computeResonanceScore 返回 null）→ false', () => {
    const plan = makePlan({
      confidence: {
        mode: 'subjective',
        subjective_score: 3,
        subjective_reason: '',
        final_score: 3,
      },
    })
    expect(shouldAutoDraft(plan)).toBe(false)
  })
})
