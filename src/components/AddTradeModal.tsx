import { useState, useEffect } from 'react'
import type { Trade, AssetClass, Direction, EmotionTag } from '../types/trade'
import { useTradeStore } from '../store/useTradeStore'
import { generateId } from '../utils/calculations'
import { X } from 'lucide-react'

const ASSET_CLASSES: { value: AssetClass; label: string }[] = [
  { value: 'equity', label: '美股个股' },
  { value: 'option', label: '美股期权' },
  { value: 'etf', label: 'ETF' },
  { value: 'crypto', label: '数字货币' },
  { value: 'cfd', label: 'CFD' },
  { value: 'futures', label: '期货' },
]

const DIRECTIONS: Record<AssetClass, { value: Direction; label: string }[]> = {
  equity: [
    { value: 'buy', label: '买入' },
    { value: 'sell', label: '卖出' },
    { value: 'short', label: '做空' },
    { value: 'cover', label: '买入回补' },
  ],
  option: [
    { value: 'buy', label: '买入开仓 (BTO)' },
    { value: 'sell', label: '卖出平仓 (STC)' },
    { value: 'short', label: '卖出开仓 (STO)' },
    { value: 'cover', label: '买入平仓 (BTC)' },
  ],
  etf: [
    { value: 'buy', label: '买入' },
    { value: 'sell', label: '卖出' },
    { value: 'short', label: '做空' },
    { value: 'cover', label: '买入回补' },
  ],
  crypto: [
    { value: 'buy', label: '买入' },
    { value: 'sell', label: '卖出' },
    { value: 'short', label: '做空 (合约)' },
    { value: 'cover', label: '平空 (合约)' },
  ],
  cfd: [
    { value: 'buy', label: '开多' },
    { value: 'sell', label: '平多' },
    { value: 'short', label: '开空' },
    { value: 'cover', label: '平空' },
  ],
  futures: [
    { value: 'buy', label: '开多' },
    { value: 'sell', label: '平多' },
    { value: 'short', label: '开空' },
    { value: 'cover', label: '平空' },
  ],
}

const EMOTIONS: { value: EmotionTag; label: string; color: string }[] = [
  { value: 'calm', label: '冷静', color: '#22c55e' },
  { value: 'confident', label: '自信', color: '#3b82f6' },
  { value: 'hesitant', label: '犹豫', color: '#eab308' },
  { value: 'impulsive', label: '冲动', color: '#ef4444' },
]

interface Props {
  onClose: () => void
  editTrade?: Trade
}

const now = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function AddTradeModal({ onClose, editTrade }: Props) {
  const { addTrade, updateTrade, accounts, selectedAccount } = useTradeStore()
  const [validationError, setValidationError] = useState<string | null>(null)

  const [form, setForm] = useState(() =>
    editTrade
      ? {
          account_id: editTrade.account_id,
          asset_class: editTrade.asset_class,
          symbol: editTrade.symbol,
          direction: editTrade.direction,
          quantity: String(editTrade.quantity),
          price: String(editTrade.price),
          commission: String(editTrade.commission),
          fees: String(editTrade.fees),
          currency: editTrade.currency,
          traded_at: editTrade.traded_at.slice(0, 16),
          strategy_tags: editTrade.strategy_tags.join(', '),
          notes: editTrade.notes,
          emotion: (editTrade.emotion as EmotionTag) || '' as EmotionTag | '',
          contract_multiplier: String((editTrade.metadata as Record<string, unknown>)?.contract_multiplier ?? (editTrade.asset_class === 'option' ? '100' : '1')),
          expiration: String((editTrade.metadata as Record<string, unknown>)?.expiration ?? ''),
          strike: String((editTrade.metadata as Record<string, unknown>)?.strike ?? ''),
          option_type: String((editTrade.metadata as Record<string, unknown>)?.option_type ?? 'call'),
          exchange: String((editTrade.metadata as Record<string, unknown>)?.exchange ?? ''),
          leverage: String((editTrade.metadata as Record<string, unknown>)?.leverage ?? ''),
          gas_fee: String((editTrade.metadata as Record<string, unknown>)?.gas_fee ?? ''),
          funding_rate: String((editTrade.metadata as Record<string, unknown>)?.funding_rate ?? ''),
          swap_fee: String((editTrade.metadata as Record<string, unknown>)?.swap_fee ?? ''),
          margin_rate: String((editTrade.metadata as Record<string, unknown>)?.margin_rate ?? ''),
          contract_month: String((editTrade.metadata as Record<string, unknown>)?.contract_month ?? ''),
          multiplier: String((editTrade.metadata as Record<string, unknown>)?.multiplier ?? ''),
        }
      : {
          account_id: selectedAccount ?? accounts[0]?.id ?? 'default',
          asset_class: 'equity' as AssetClass,
          symbol: '',
          direction: 'buy' as Direction,
          quantity: '',
          price: '',
          commission: '',
          fees: '',
          currency: 'USD',
          traded_at: now(),
          strategy_tags: '',
          notes: '',
          emotion: '' as EmotionTag | '',
          contract_multiplier: '1',
          expiration: '',
          strike: '',
          option_type: 'call',
          exchange: '',
          leverage: '',
          gas_fee: '',
          funding_rate: '',
          swap_fee: '',
          margin_rate: '',
          contract_month: '',
          multiplier: '',
        }
  )

  const blankForm = () => ({
    account_id: selectedAccount ?? accounts[0]?.id ?? 'default',
    asset_class: 'equity' as AssetClass,
    symbol: '',
    direction: 'buy' as Direction,
    quantity: '',
    price: '',
    commission: '',
    fees: '',
    currency: 'USD',
    traded_at: now(),
    strategy_tags: '',
    notes: '',
    emotion: '' as EmotionTag | '',
    contract_multiplier: '1',
    expiration: '',
    strike: '',
    option_type: 'call',
    exchange: '',
    leverage: '',
    gas_fee: '',
    funding_rate: '',
    swap_fee: '',
    margin_rate: '',
    contract_month: '',
    multiplier: '',
  })

  useEffect(() => {
    if (editTrade) {
      const meta = (editTrade.metadata ?? {}) as Record<string, unknown>
      setForm({
        account_id: editTrade.account_id,
        asset_class: editTrade.asset_class,
        symbol: editTrade.symbol,
        direction: editTrade.direction,
        quantity: String(editTrade.quantity),
        price: String(editTrade.price),
        commission: String(editTrade.commission),
        fees: String(editTrade.fees),
        currency: editTrade.currency,
        traded_at: editTrade.traded_at.slice(0, 16),
        strategy_tags: editTrade.strategy_tags.join(', '),
        notes: editTrade.notes,
        emotion: (editTrade.emotion as EmotionTag) || '',
        expiration: String(meta.expiration ?? ''),
        strike: String(meta.strike ?? ''),
        option_type: String(meta.option_type ?? 'call'),
        exchange: String(meta.exchange ?? ''),
        leverage: String(meta.leverage ?? ''),
        gas_fee: String(meta.gas_fee ?? ''),
        funding_rate: String(meta.funding_rate ?? ''),
        swap_fee: String(meta.swap_fee ?? ''),
        margin_rate: String(meta.margin_rate ?? ''),
        contract_month: String(meta.contract_month ?? ''),
        multiplier: String(meta.multiplier ?? ''),
        contract_multiplier: String(meta.contract_multiplier ?? (editTrade.asset_class === 'option' ? '100' : '1')),
      })
    } else {
      setForm(blankForm())
    }
  }, [editTrade])

  const DEFAULT_MULTIPLIER: Partial<Record<AssetClass, string>> = { option: '100', futures: '1', cfd: '0.1' }

  const set = (key: string, value: string) => {
    if (key === 'direction' || key === 'quantity' || key === 'symbol') setValidationError(null)
    setForm((f) => {
      const next = { ...f, [key]: value }
      // Auto-set contract_multiplier when asset_class changes (only if user hasn't touched it)
      if (key === 'asset_class') {
        next.contract_multiplier = DEFAULT_MULTIPLIER[value as AssetClass] ?? '1'
      }
      return next
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const qty = parseFloat(form.quantity) || 0
    const price = parseFloat(form.price) || 0
    const contractMultiplier = parseFloat(form.contract_multiplier) || 1
    const metadata: Record<string, unknown> = {
      contract_multiplier: contractMultiplier,
    }

    if (form.asset_class === 'option') {
      metadata.expiration = form.expiration
      metadata.strike = form.strike
      metadata.option_type = form.option_type
    }
    if (form.asset_class === 'crypto') {
      if (form.exchange) metadata.exchange = form.exchange
      if (form.leverage) metadata.leverage = form.leverage
      if (form.gas_fee) metadata.gas_fee = parseFloat(form.gas_fee)
      if (form.funding_rate) metadata.funding_rate = parseFloat(form.funding_rate)
    }
    if (form.asset_class === 'cfd') {
      if (form.leverage) metadata.leverage = form.leverage
      if (form.swap_fee) metadata.swap_fee = parseFloat(form.swap_fee)
    }
    if (form.asset_class === 'futures') {
      if (form.contract_month) metadata.contract_month = form.contract_month
      if (form.multiplier) metadata.multiplier = parseFloat(form.multiplier)
      if (form.margin_rate) metadata.margin_rate = parseFloat(form.margin_rate)
    }

    const trade: Trade = {
      id: editTrade?.id || generateId(),
      account_id: form.account_id,
      asset_class: form.asset_class,
      symbol: form.symbol.toUpperCase().trim(),
      direction: form.direction,
      quantity: qty,
      price,
      total_amount: qty * price * contractMultiplier,
      commission: parseFloat(form.commission) || 0,
      fees: parseFloat(form.fees) || 0,
      currency: form.currency,
      traded_at: new Date(form.traded_at).toISOString(),
      strategy_tags: form.strategy_tags.split(',').map((s) => s.trim()).filter(Boolean),
      notes: form.notes,
      emotion: form.emotion || undefined,
      metadata,
      created_at: editTrade?.created_at || new Date().toISOString(),
    }

    if (editTrade) {
      updateTrade(editTrade.id, trade)
      onClose()
    } else {
      const error = addTrade(trade)
      if (error) {
        setValidationError(error)
        return
      }
      onClose()
    }
  }

  const inp = (style?: React.CSSProperties): React.CSSProperties => ({
    width: '100%', padding: '8px 12px',
    background: '#22263a', border: '1px solid #2d3148',
    borderRadius: 8, color: '#e2e8f0', fontSize: 14,
    outline: 'none', ...style,
  })

  const label = (text: string) => (
    <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 4 }}>{text}</label>
  )

  const field = (children: React.ReactNode, span = 1) => (
    <div style={{ gridColumn: `span ${span}` }}>{children}</div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: '#1a1d27', border: '1px solid #2d3148',
        borderRadius: 16, padding: 24, width: '100%', maxWidth: 620,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>
            {editTrade ? '编辑交易' : '添加交易'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8892a4' }}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Asset class */}
            {field(<>
              {label('品种类型')}
              <select value={form.asset_class} onChange={(e) => set('asset_class', e.target.value)} style={inp()} required>
                {ASSET_CLASSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </>)}

            {/* Account */}
            {field(<>
              {label('账户')}
              <select value={form.account_id} onChange={(e) => set('account_id', e.target.value)} style={inp()}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </>)}

            {/* Symbol */}
            {field(<>
              {label('标的代码')}
              <input value={form.symbol}
                onChange={(e) => set('symbol', e.target.value.slice(0, 30))}
                placeholder={form.asset_class === 'option' ? 'AAPL' : form.asset_class === 'crypto' ? 'BTC/USDT' : 'AAPL'}
                maxLength={30} style={inp()} required />
            </>)}

            {/* Direction */}
            {field(<>
              {label('方向')}
              <select value={form.direction} onChange={(e) => set('direction', e.target.value as Direction)} style={inp()}>
                {DIRECTIONS[form.asset_class].map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </>)}

            {/* Quantity */}
            {field(<>
              {label('数量')}
              <input type="number" step="any" min="0" max="999999999" value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)} placeholder="0" style={inp()} required />
            </>)}

            {/* Price */}
            {field(<>
              {label('成交价')}
              <input type="number" step="any" min="0" max="999999999" value={form.price}
                onChange={(e) => set('price', e.target.value)} placeholder="0.00" style={inp()} required />
            </>)}

            {/* Contract multiplier */}
            {field(<>
              {label('合约乘数')}
              <input type="number" step="0.0001" min="0.0001" value={form.contract_multiplier}
                onChange={(e) => set('contract_multiplier', e.target.value)}
                placeholder="1" style={inp()} />
            </>)}

            {/* Total amount preview */}
            {field(<>
              {label('预计金额')}
              <div style={{
                ...inp(), display: 'flex', alignItems: 'center',
                background: '#161924', color: '#8892a4', fontFamily: 'monospace',
                justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 12, color: '#4a5268' }}>
                  {form.quantity || '0'} × ${form.price || '0'} × {form.contract_multiplier || '1'} =
                </span>
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                  ${((parseFloat(form.quantity) || 0) * (parseFloat(form.price) || 0) * (parseFloat(form.contract_multiplier) || 1)).toFixed(2)}
                </span>
              </div>
            </>)}

            {/* Commission */}
            {field(<>
              {label('佣金')}
              <input type="number" step="any" min="0" value={form.commission}
                onChange={(e) => set('commission', e.target.value)} placeholder="0.00" style={inp()} />
            </>)}

            {/* Fees */}
            {field(<>
              {label('其他费用')}
              <input type="number" step="any" min="0" value={form.fees}
                onChange={(e) => set('fees', e.target.value)} placeholder="0.00" style={inp()} />
            </>)}

            {/* Date */}
            {field(<>
              {label('交易时间')}
              <input type="datetime-local" value={form.traded_at}
                onChange={(e) => set('traded_at', e.target.value)} style={inp({ colorScheme: 'dark' })} required />
            </>)}

            {/* Currency */}
            {field(<>
              {label('计价货币')}
              <select value={form.currency} onChange={(e) => set('currency', e.target.value)} style={inp()}>
                {['USD', 'USDT', 'CNY', 'EUR', 'GBP', 'JPY', 'BTC', 'ETH'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </>)}

            {/* Option-specific */}
            {form.asset_class === 'option' && (<>
              {field(<>
                {label('类型 Call/Put')}
                <select value={form.option_type} onChange={(e) => set('option_type', e.target.value)} style={inp()}>
                  <option value="call">Call</option>
                  <option value="put">Put</option>
                </select>
              </>)}
              {field(<>
                {label('执行价 (Strike)')}
                <input type="number" step="any" value={form.strike}
                  onChange={(e) => set('strike', e.target.value)} placeholder="150.00" style={inp()} />
              </>)}
              {field(<>
                {label('到期日')}
                <input type="date" value={form.expiration}
                  onChange={(e) => set('expiration', e.target.value)}
                  style={inp({ colorScheme: 'dark' })} />
              </>, 2)}
            </>)}

            {/* Crypto-specific */}
            {form.asset_class === 'crypto' && (<>
              {field(<>
                {label('交易所')}
                <input value={form.exchange} onChange={(e) => set('exchange', e.target.value)}
                  placeholder="Binance" style={inp()} />
              </>)}
              {field(<>
                {label('杠杆倍数')}
                <input value={form.leverage} onChange={(e) => set('leverage', e.target.value)}
                  placeholder="1x" style={inp()} />
              </>)}
              {field(<>
                {label('Gas Fee')}
                <input type="number" step="any" value={form.gas_fee}
                  onChange={(e) => set('gas_fee', e.target.value)} placeholder="0" style={inp()} />
              </>)}
              {field(<>
                {label('资金费率 (%)')}
                <input type="number" step="any" value={form.funding_rate}
                  onChange={(e) => set('funding_rate', e.target.value)} placeholder="0" style={inp()} />
              </>)}
            </>)}

            {/* CFD-specific */}
            {form.asset_class === 'cfd' && (<>
              {field(<>
                {label('杠杆倍数')}
                <input value={form.leverage} onChange={(e) => set('leverage', e.target.value)}
                  placeholder="10x" style={inp()} />
              </>)}
              {field(<>
                {label('隔夜费')}
                <input type="number" step="any" value={form.swap_fee}
                  onChange={(e) => set('swap_fee', e.target.value)} placeholder="0" style={inp()} />
              </>)}
            </>)}

            {/* Futures-specific */}
            {form.asset_class === 'futures' && (<>
              {field(<>
                {label('交割月份')}
                <input value={form.contract_month} onChange={(e) => set('contract_month', e.target.value)}
                  placeholder="2506" style={inp()} />
              </>)}
              {field(<>
                {label('合约乘数')}
                <input type="number" step="any" value={form.multiplier}
                  onChange={(e) => set('multiplier', e.target.value)} placeholder="50" style={inp()} />
              </>)}
              {field(<>
                {label('保证金比例 (%)')}
                <input type="number" step="any" value={form.margin_rate}
                  onChange={(e) => set('margin_rate', e.target.value)} placeholder="5" style={inp()} />
              </>, 2)}
            </>)}

            {/* Strategy tags */}
            {field(<>
              {label('策略标签（逗号分隔）')}
              <input value={form.strategy_tags}
                onChange={(e) => set('strategy_tags', e.target.value.slice(0, 200))}
                placeholder="趋势跟踪, 事件驱动" maxLength={200} style={inp()} />
            </>, 2)}

            {/* Emotion */}
            {field(<>
              {label('情绪标签')}
              <div style={{ display: 'flex', gap: 8 }}>
                {EMOTIONS.map((em) => (
                  <button key={em.value} type="button"
                    onClick={() => set('emotion', form.emotion === em.value ? '' : em.value)}
                    style={{
                      padding: '5px 10px', borderRadius: 20, border: `1px solid`,
                      borderColor: form.emotion === em.value ? em.color : '#2d3148',
                      background: form.emotion === em.value ? em.color + '22' : 'transparent',
                      color: form.emotion === em.value ? em.color : '#8892a4',
                      fontSize: 12, cursor: 'pointer',
                    }}>
                    {em.label}
                  </button>
                ))}
              </div>
            </>, 2)}

            {/* Notes */}
            {field(<>
              {label('备注')}
              <textarea value={form.notes}
                onChange={(e) => set('notes', e.target.value.slice(0, 5000))}
                placeholder="记录交易逻辑、市场分析..."
                rows={3} maxLength={5000}
                style={{ ...inp(), resize: 'vertical' as const }} />
            </>, 2)}
          </div>

          {validationError && (
            <div style={{
              background: '#ef444420', border: '1px solid #ef444440',
              borderRadius: 8, padding: '10px 14px', marginTop: 12,
              color: '#f87171', fontSize: 13,
            }}>
              ⚠️ {validationError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 20px', borderRadius: 8, border: '1px solid #2d3148',
              background: 'transparent', color: '#8892a4', cursor: 'pointer', fontSize: 14,
            }}>取消</button>
            <button type="submit" style={{
              padding: '9px 24px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}>
              {editTrade ? '保存修改' : '添加交易'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
