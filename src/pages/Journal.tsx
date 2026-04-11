import { useState, useRef, useEffect, useMemo } from 'react'
import { useTradeStore } from '../store/useTradeStore'
import { useAuthStore } from '../store/useAuthStore'
import { formatCurrency } from '../utils/calculations'
import { uploadJournalImage } from '../lib/supabase'
import { loadCloudJournal, upsertJournalEntry, deleteJournalEntry } from '../lib/syncTrades'
import { Plus, X, BookOpen, ImageIcon, Loader, Edit3, Save, ChevronLeft, Search, Filter } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'

interface JournalEntry {
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
}

const JOURNAL_KEY = 'tradeinsight-journal'
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

function loadEntries(): JournalEntry[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(JOURNAL_KEY) : null
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.filter(isValidEntry) : []
  } catch {
    return []
  }
}

function saveEntries(entries: JournalEntry[]) {
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries))
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      alert('存储空间不足，请删除部分日志记录以释放空间。')
    }
  }
}

const MISTAKE_TAGS = ['追涨杀跌', '过早止盈', '未止损', '仓位过重', '情绪交易', '违反计划', '错误判断方向', '持仓太久']

const EMOTION_COLORS: Record<string, string> = {
  '冷静': '#22c55e', '自信': '#3b82f6', '犹豫': '#eab308', '冲动': '#ef4444'
}

function blankForm() {
  return {
    date: new Date().toISOString().slice(0, 10),
    summary: '', went_well: '', improve: '', plan: '',
    pnl: '', emotion: '冷静',
    tags: [] as string[],
    images: [] as string[],
  }
}

export default function Journal() {
  const { closedTrades } = useTradeStore()
  const { user } = useAuthStore()
  const isMobile = useIsMobile()
  const [entries, setEntries] = useState<JournalEntry[]>(loadEntries)
  const [cloudLoaded, setCloudLoaded] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null)
  const [selected, setSelected] = useState<JournalEntry | null>(null)
  const [mobileShowDetail, setMobileShowDetail] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [reviewText, setReviewText] = useState('')
  const [reviewSaved, setReviewSaved] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState(blankForm)

  // Filter state
  const [filterSearch, setFilterSearch] = useState('')
  const [filterEmotions, setFilterEmotions] = useState<string[]>([])
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterExpanded, setFilterExpanded] = useState(false)

  // Check for prefill date from Positions page navigation
  useEffect(() => {
    const prefillDate = localStorage.getItem('tradeinsight-journal-prefill')
    if (prefillDate) {
      localStorage.removeItem('tradeinsight-journal-prefill')
      const pnlOnDate = closedTrades
        .filter(t => t.closed_at.slice(0, 10) === prefillDate)
        .reduce((s, t) => s + t.net_pnl, 0)
      setForm({ ...blankForm(), date: prefillDate, pnl: String(pnlOnDate.toFixed(2)) })
      setEditingEntry(null)
      setShowModal(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load from Supabase on mount
  useEffect(() => {
    if (!user || cloudLoaded) return
    loadCloudJournal(user.id).then((cloudEntries) => {
      if (!cloudEntries) return
      setCloudLoaded(true)
      const valid = cloudEntries.filter(isValidEntry)
      if (valid.length > 0) {
        setEntries(valid)
        saveEntries(valid)
      } else {
        const local = loadEntries()
        if (local.length > 0) {
          local.forEach((e) => void upsertJournalEntry(user.id, { ...e, images: e.images ?? [], review: e.review ?? '' }))
        }
        setCloudLoaded(true)
      }
    })
  }, [user?.id])

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const toggleTag = (tag: string) => {
    setForm((f) => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag],
    }))
  }

  const openAdd = () => {
    setEditingEntry(null)
    setForm(blankForm())
    setShowModal(true)
  }

  const openEdit = (e: JournalEntry) => {
    setEditingEntry(e)
    setForm({
      date: e.date,
      summary: e.summary,
      went_well: e.went_well,
      improve: e.improve,
      plan: e.plan,
      pnl: String(e.pnl),
      emotion: e.emotion,
      tags: [...e.tags],
      images: [...(e.images || [])],
    })
    setShowModal(true)
  }

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || !user) return
    const remaining = 5 - form.images.length
    const toUpload = Array.from(files).slice(0, remaining)
    if (toUpload.length === 0) return
    setUploading(true)
    const urls: string[] = []
    let failed = 0
    for (const file of toUpload) {
      if (file.size > 10 * 1024 * 1024) { alert(`图片 ${file.name} 超过 10MB，已跳过`); continue }
      if (!file.type.startsWith('image/')) { alert(`${file.name} 不是图片文件，已跳过`); continue }
      const url = await uploadJournalImage(user.id, file)
      if (url) urls.push(url)
      else failed++
    }
    setUploading(false)
    if (urls.length > 0) setForm((f) => ({ ...f, images: [...f.images, ...urls] }))
    if (failed > 0) alert(`${failed} 张图片上传失败，请检查 Supabase Storage 的 RLS 策略是否已配置。`)
  }

  const removeImage = (url: string) => setForm((f) => ({ ...f, images: f.images.filter((u) => u !== url) }))

  const save = () => {
    const updated: JournalEntry = {
      id: editingEntry?.id ?? Date.now().toString(36),
      date: form.date,
      summary: form.summary,
      went_well: form.went_well,
      improve: form.improve,
      plan: form.plan,
      pnl: parseFloat(form.pnl) || 0,
      emotion: form.emotion,
      tags: form.tags,
      images: form.images,
      review: editingEntry?.review,
    }
    const newEntries = editingEntry
      ? entries.map((e) => e.id === editingEntry.id ? updated : e)
      : [updated, ...entries]
    setEntries(newEntries)
    saveEntries(newEntries)
    if (user) void upsertJournalEntry(user.id, { ...updated, images: updated.images ?? [], review: updated.review ?? '' })
    setShowModal(false)
    setEditingEntry(null)
    if (selected?.id === updated.id) setSelected(updated)
  }

  const deleteEntry = (id: string) => {
    const updated = entries.filter((e) => e.id !== id)
    setEntries(updated)
    saveEntries(updated)
    if (user) void deleteJournalEntry(user.id, id)
    if (selected?.id === id) { setSelected(null); setReviewText('') }
  }

  const selectEntry = (e: JournalEntry) => {
    setSelected(e)
    setReviewText(e.review || '')
    setReviewSaved(false)
    if (isMobile) setMobileShowDetail(true)
  }

  const saveReview = () => {
    if (!selected) return
    const updatedEntry = { ...selected, review: reviewText }
    const updated = entries.map((e) => e.id === selected.id ? updatedEntry : e)
    setEntries(updated)
    saveEntries(updated)
    if (user) void upsertJournalEntry(user.id, { ...updatedEntry, images: updatedEntry.images ?? [], review: reviewText })
    setSelected((s) => s ? { ...s, review: reviewText } : s)
    setReviewSaved(true)
    setTimeout(() => setReviewSaved(false), 2000)
  }

  const today = new Date().toISOString().slice(0, 10)
  const todayPnl = closedTrades
    .filter((t) => t.closed_at.slice(0, 10) === today)
    .reduce((s, t) => s + t.net_pnl, 0)

  const hasActiveFilter = !!(filterSearch || filterEmotions.length || filterTags.length || filterDateFrom || filterDateTo)

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (filterSearch) {
        const q = filterSearch.toLowerCase()
        const inText = [e.summary, e.went_well, e.improve, e.plan, e.review ?? '']
          .join(' ').toLowerCase().includes(q)
        if (!inText) return false
      }
      if (filterEmotions.length && !filterEmotions.includes(e.emotion)) return false
      if (filterTags.length && !filterTags.some(t => e.tags.includes(t))) return false
      if (filterDateFrom && e.date < filterDateFrom) return false
      if (filterDateTo && e.date > filterDateTo) return false
      return true
    })
  }, [entries, filterSearch, filterEmotions, filterTags, filterDateFrom, filterDateTo])

  const resetFilters = () => {
    setFilterSearch('')
    setFilterEmotions([])
    setFilterTags([])
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  const toggleFilterEmotion = (em: string) =>
    setFilterEmotions(prev => prev.includes(em) ? prev.filter(x => x !== em) : [...prev, em])

  const toggleFilterTag = (tag: string) =>
    setFilterTags(prev => prev.includes(tag) ? prev.filter(x => x !== tag) : [...prev, tag])

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px',
    background: '#22263a', border: '1px solid #2d3148',
    borderRadius: 8, color: '#e2e8f0', fontSize: 14, outline: 'none',
  }

  const lbl = (text: string) => (
    <label style={{ fontSize: 12, color: '#8892a4', display: 'block', marginBottom: 4 }}>{text}</label>
  )

  // Mobile: if showing detail, show back button header
  const mobileDetailHeader = isMobile && mobileShowDetail && selected

  return (
    <div style={{ padding: isMobile ? '12px 10px' : 24 }}>
      {/* Header */}
      {!mobileDetailHeader && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isMobile ? 12 : 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 700, color: '#e2e8f0' }}>交易日志</h1>
            <p style={{ margin: '4px 0 0', color: '#8892a4', fontSize: 13 }}>今日盈亏：
              <span style={{ color: todayPnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                {todayPnl >= 0 ? '+' : ''}{formatCurrency(todayPnl)}
              </span>
            </p>
          </div>
          <button onClick={openAdd} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: isMobile ? '8px 12px' : '9px 16px', borderRadius: 8, border: 'none',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            color: '#fff', cursor: 'pointer', fontSize: isMobile ? 13 : 14, fontWeight: 600,
          }}>
            <Plus size={15} /> 新建日志
          </button>
        </div>
      )}

      {/* Mobile detail back bar */}
      {mobileDetailHeader && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button onClick={() => setMobileShowDetail(false)} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer', color: '#60a5fa', fontSize: 14, padding: 0,
          }}>
            <ChevronLeft size={18} /> 返回列表
          </button>
        </div>
      )}

      <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 16 }}>
        {/* Entry list — hidden on mobile when detail is open */}
        <div style={{ display: (isMobile && mobileShowDetail) ? 'none' : 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Search & filter bar */}
          {entries.length > 0 && (
            <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 10, padding: '10px 12px', marginBottom: 2 }}>
              {/* Row 1: search input + expand button */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#8892a4' }} />
                  <input
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    placeholder="搜索总结、复盘..."
                    style={{
                      width: '100%', padding: '7px 10px 7px 28px',
                      background: '#22263a', border: '1px solid #2d3148',
                      borderRadius: 7, color: '#e2e8f0', fontSize: 12, outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <button
                  onClick={() => setFilterExpanded(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '6px 10px', borderRadius: 7,
                    border: `1px solid ${hasActiveFilter ? '#3b82f6' : '#2d3148'}`,
                    background: hasActiveFilter ? '#3b82f620' : 'transparent',
                    color: hasActiveFilter ? '#60a5fa' : '#8892a4',
                    cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
                  }}
                >
                  <Filter size={12} />
                  {hasActiveFilter ? '筛选中' : '筛选'}
                </button>
              </div>

              {/* Row 2: expanded filters */}
              {filterExpanded && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Emotion filter */}
                  <div>
                    <div style={{ fontSize: 11, color: '#8892a4', marginBottom: 5 }}>情绪状态</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {Object.keys(EMOTION_COLORS).map((em) => (
                        <button key={em} onClick={() => toggleFilterEmotion(em)} style={{
                          padding: '3px 9px', borderRadius: 12, border: '1px solid',
                          borderColor: filterEmotions.includes(em) ? EMOTION_COLORS[em] : '#2d3148',
                          background: filterEmotions.includes(em) ? EMOTION_COLORS[em] + '22' : 'transparent',
                          color: filterEmotions.includes(em) ? EMOTION_COLORS[em] : '#8892a4',
                          fontSize: 11, cursor: 'pointer',
                        }}>{em}</button>
                      ))}
                    </div>
                  </div>

                  {/* Mistake tag filter */}
                  <div>
                    <div style={{ fontSize: 11, color: '#8892a4', marginBottom: 5 }}>失误标签</div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {MISTAKE_TAGS.map((tag) => (
                        <button key={tag} onClick={() => toggleFilterTag(tag)} style={{
                          padding: '3px 8px', borderRadius: 10, border: '1px solid',
                          borderColor: filterTags.includes(tag) ? '#ef4444' : '#2d3148',
                          background: filterTags.includes(tag) ? '#ef444422' : 'transparent',
                          color: filterTags.includes(tag) ? '#ef4444' : '#8892a4',
                          fontSize: 11, cursor: 'pointer',
                        }}>{tag}</button>
                      ))}
                    </div>
                  </div>

                  {/* Date range */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#8892a4', whiteSpace: 'nowrap' }}>日期范围</span>
                    <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
                      style={{ flex: 1, padding: '5px 8px', background: '#22263a', border: '1px solid #2d3148', borderRadius: 6, color: '#e2e8f0', fontSize: 11, outline: 'none', colorScheme: 'dark' }} />
                    <span style={{ color: '#4a5268', fontSize: 12 }}>—</span>
                    <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
                      style={{ flex: 1, padding: '5px 8px', background: '#22263a', border: '1px solid #2d3148', borderRadius: 6, color: '#e2e8f0', fontSize: 11, outline: 'none', colorScheme: 'dark' }} />
                  </div>

                  {hasActiveFilter && (
                    <button onClick={resetFilters} style={{
                      alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 6,
                      border: '1px solid #2d3148', background: 'transparent',
                      color: '#ef4444', fontSize: 11, cursor: 'pointer',
                    }}>清除筛选</button>
                  )}
                </div>
              )}

              {hasActiveFilter && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#60a5fa' }}>
                  找到 {filteredEntries.length} / {entries.length} 条日志
                </div>
              )}
            </div>
          )}

          {entries.length === 0 ? (
            <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: 40, textAlign: 'center', color: '#4a5268' }}>
              <BookOpen size={32} style={{ margin: '0 auto 12px', display: 'block' }} />
              暂无日志记录
            </div>
          ) : filteredEntries.length === 0 ? (
            <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: 32, textAlign: 'center', color: '#4a5268', fontSize: 13 }}>
              没有匹配的日志，请调整筛选条件
            </div>
          ) : filteredEntries.map((e) => (
            <div key={e.id} onClick={() => selectEntry(e)} style={{
              background: '#1a1d27',
              border: `1px solid ${selected?.id === e.id ? '#3b82f6' : '#2d3148'}`,
              borderLeft: selected?.id === e.id ? '3px solid #3b82f6' : '3px solid transparent',
              borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{e.date}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {e.images && e.images.length > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#4a5268' }}>
                      <ImageIcon size={11} /> {e.images.length}
                    </span>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 600, color: e.pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                    {e.pnl >= 0 ? '+' : ''}{formatCurrency(e.pnl)}
                  </span>
                  <button onClick={(ev) => { ev.stopPropagation(); openEdit(e) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8892a4', padding: 0, lineHeight: 1 }}>
                    <Edit3 size={13} />
                  </button>
                  <button onClick={(ev) => { ev.stopPropagation(); deleteEntry(e.id) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0, lineHeight: 1 }}>
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#8892a4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>
                {e.summary || '（无摘要）'}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 6, background: (EMOTION_COLORS[e.emotion] || '#6b7280') + '22', color: EMOTION_COLORS[e.emotion] || '#6b7280' }}>
                  {e.emotion}
                </span>
                {e.tags.slice(0, 2).map((t) => (
                  <span key={t} style={{ fontSize: 11, padding: '1px 6px', borderRadius: 6, background: '#22263a', color: '#8892a4' }}>{t}</span>
                ))}
                {e.review && <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 6, background: '#8b5cf620', color: '#a78bfa' }}>已复盘</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Right column: detail + review — hidden on mobile when list is shown */}
        <div style={{ display: (isMobile && !mobileShowDetail) ? 'none' : 'flex', flexDirection: 'column', gap: 12, ...(isMobile ? { marginTop: 0 } : {}) }}>
          {/* Detail pane */}
          <div style={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 12, padding: isMobile ? '14px' : '20px' }}>
            {!selected ? (
              <div style={{ textAlign: 'center', color: '#4a5268', fontSize: 13, padding: '32px 0' }}>选择左侧日志查看详情</div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>{selected.date}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: selected.pnl >= 0 ? '#22c55e' : '#ef4444', marginTop: 2 }}>
                      {selected.pnl >= 0 ? '+' : ''}{formatCurrency(selected.pnl)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{
                      padding: '4px 12px', borderRadius: 16,
                      background: (EMOTION_COLORS[selected.emotion] || '#6b7280') + '22',
                      color: EMOTION_COLORS[selected.emotion] || '#6b7280',
                      fontSize: 13, fontWeight: 600,
                    }}>{selected.emotion}</span>
                    <button onClick={() => openEdit(selected)} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 10px', borderRadius: 7, border: '1px solid #2d3148',
                      background: 'transparent', color: '#8892a4', cursor: 'pointer', fontSize: 12,
                    }}>
                      <Edit3 size={13} /> 编辑
                    </button>
                  </div>
                </div>

                {selected.summary && <Section label="当日总结" content={selected.summary} />}
                {selected.went_well && <Section label="做得好的" content={selected.went_well} color="#22c55e" />}
                {selected.improve && <Section label="需要改进的" content={selected.improve} color="#ef4444" />}
                {selected.plan && <Section label="明日计划" content={selected.plan} color="#3b82f6" />}

                {/* Linked trades for this date */}
                {(() => {
                  const dayTrades = closedTrades.filter((t) => t.closed_at.slice(0, 10) === selected.date)
                  if (dayTrades.length === 0) return null
                  return (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                        当日交易记录 ({dayTrades.length} 笔)
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {dayTrades.map((t) => (
                          <div key={t.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: '#161924', borderRadius: 8, padding: '7px 11px', fontSize: 13,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 700, color: '#e2e8f0' }}>{t.symbol}</span>
                              <span style={{ fontSize: 11, color: t.direction === 'long' ? '#22c55e' : '#f97316', fontWeight: 600 }}>
                                {t.direction === 'long' ? '多' : '空'}
                              </span>
                              <span style={{ color: '#4a5268' }}>{t.quantity} 股 · {formatCurrency(t.open_price)}→{formatCurrency(t.close_price)}</span>
                            </div>
                            <span style={{ fontWeight: 600, color: t.net_pnl >= 0 ? '#22c55e' : '#ef4444' }}>
                              {t.net_pnl >= 0 ? '+' : ''}{formatCurrency(t.net_pnl)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {selected.tags.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 6 }}>失误标签</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {selected.tags.map((t) => (
                        <span key={t} style={{ padding: '3px 10px', borderRadius: 10, background: '#ef444422', color: '#ef4444', fontSize: 12 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selected.images && selected.images.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ImageIcon size={12} /> 截图 ({selected.images.length})
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                      {selected.images.map((url, i) => (
                        <div key={i} onClick={() => setLightbox(url)} style={{
                          aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden',
                          cursor: 'pointer', border: '1px solid #2d3148',
                        }}>
                          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Review pane */}
          <div style={{
            background: 'linear-gradient(145deg, #1a1d27, #1d2136)',
            border: '1px solid #2d3148',
            borderTop: '2px solid #8b5cf6',
            borderRadius: 12, padding: '18px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 3, height: 14, background: '#8b5cf6', borderRadius: 2 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>复盘笔记</span>
                {reviewSaved && <span style={{ fontSize: 11, color: '#22c55e' }}>已保存 ✓</span>}
              </div>
              {selected && (
                <button onClick={saveReview} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 7, border: 'none',
                  background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                  color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}>
                  <Save size={12} /> 保存复盘
                </button>
              )}
            </div>
            <textarea
              value={selected ? reviewText : ''}
              onChange={(e) => setReviewText(e.target.value)}
              disabled={!selected}
              placeholder={selected ? '记录你的复盘思考：这笔交易的逻辑是否正确？执行是否到位？下次遇到类似情况应该如何处理？' : '请先选择左侧日志'}
              rows={6}
              style={{
                width: '100%', padding: '10px 12px',
                background: '#22263a', border: '1px solid #2d3148',
                borderRadius: 8, color: selected ? '#e2e8f0' : '#4a5268',
                fontSize: 14, outline: 'none', resize: 'vertical',
                lineHeight: 1.6, boxSizing: 'border-box',
                cursor: selected ? 'text' : 'default',
              }}
            />
          </div>
        </div>
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 16,
        }} onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{
            background: '#1a1d27', border: '1px solid #2d3148',
            borderRadius: 16, padding: 24, width: '100%', maxWidth: 560,
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>
                {editingEntry ? '编辑日志' : '新建交易日志'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8892a4' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  {lbl('日期')}
                  <input type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} style={inp} />
                </div>
                <div>
                  {lbl('当日盈亏')}
                  <input type="number" step="any" value={form.pnl} onChange={(e) => setField('pnl', e.target.value)} placeholder="0.00" style={inp} />
                </div>
              </div>

              <div>
                {lbl('情绪状态')}
                <div style={{ display: 'flex', gap: 8 }}>
                  {Object.keys(EMOTION_COLORS).map((em) => (
                    <button key={em} type="button" onClick={() => setField('emotion', em)} style={{
                      padding: '5px 12px', borderRadius: 20, border: '1px solid',
                      borderColor: form.emotion === em ? EMOTION_COLORS[em] : '#2d3148',
                      background: form.emotion === em ? EMOTION_COLORS[em] + '22' : 'transparent',
                      color: form.emotion === em ? EMOTION_COLORS[em] : '#8892a4',
                      fontSize: 13, cursor: 'pointer',
                    }}>{em}</button>
                  ))}
                </div>
              </div>

              <div>{lbl('当日总结')}<textarea value={form.summary} onChange={(e) => setField('summary', e.target.value)} placeholder="今日市场情况、主要交易决策..." rows={2} style={{ ...inp, resize: 'vertical' }} /></div>
              <div>{lbl('做得好的')}<textarea value={form.went_well} onChange={(e) => setField('went_well', e.target.value)} placeholder="今天执行比较好的方面..." rows={2} style={{ ...inp, resize: 'vertical' }} /></div>
              <div>{lbl('需要改进的')}<textarea value={form.improve} onChange={(e) => setField('improve', e.target.value)} placeholder="今天需要改进的地方..." rows={2} style={{ ...inp, resize: 'vertical' }} /></div>
              <div>{lbl('明日计划')}<textarea value={form.plan} onChange={(e) => setField('plan', e.target.value)} placeholder="明天的交易计划和目标..." rows={2} style={{ ...inp, resize: 'vertical' }} /></div>

              {/* Image upload */}
              <div>
                {lbl(`交易截图（最多 5 张）`)}
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleImageUpload(e.target.files)} />
                {form.images.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 8, marginBottom: 8 }}>
                    {form.images.map((url, i) => (
                      <div key={i} style={{ position: 'relative', aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', border: '1px solid #2d3148' }}>
                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button onClick={() => removeImage(url)} style={{
                          position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%',
                          background: 'rgba(0,0,0,0.7)', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', padding: 0,
                        }}><X size={10} /></button>
                      </div>
                    ))}
                  </div>
                )}
                {form.images.length < 5 && (
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{
                    width: '100%', padding: '10px', borderRadius: 8, border: '1px dashed #2d3148',
                    background: 'transparent', color: uploading ? '#4a5268' : '#8892a4',
                    cursor: uploading ? 'default' : 'pointer', fontSize: 13,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    {uploading ? <><Loader size={14} /> 上传中...</> : <><ImageIcon size={14} /> 点击上传截图</>}
                  </button>
                )}
              </div>

              <div>
                {lbl('失误标签')}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {MISTAKE_TAGS.map((t) => (
                    <button key={t} type="button" onClick={() => toggleTag(t)} style={{
                      padding: '4px 10px', borderRadius: 10, border: '1px solid',
                      borderColor: form.tags.includes(t) ? '#ef4444' : '#2d3148',
                      background: form.tags.includes(t) ? '#ef444422' : 'transparent',
                      color: form.tags.includes(t) ? '#ef4444' : '#8892a4',
                      fontSize: 12, cursor: 'pointer',
                    }}>{t}</button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowModal(false)} style={{
                padding: '9px 20px', borderRadius: 8, border: '1px solid #2d3148',
                background: 'transparent', color: '#8892a4', cursor: 'pointer', fontSize: 14,
              }}>取消</button>
              <button onClick={save} disabled={uploading} style={{
                padding: '9px 24px', borderRadius: 8, border: 'none',
                background: uploading ? '#2d3148' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                color: '#fff', cursor: uploading ? 'default' : 'pointer', fontSize: 14, fontWeight: 600,
              }}>{editingEntry ? '保存修改' : '保存日志'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2000, cursor: 'zoom-out', padding: 24,
        }}>
          <img src={lightbox} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, objectFit: 'contain' }} />
          <button onClick={() => setLightbox(null)} style={{
            position: 'absolute', top: 16, right: 16,
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%',
            width: 36, height: 36, cursor: 'pointer', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><X size={18} /></button>
        </div>
      )}
    </div>
  )
}

function Section({ label, content, color = '#e2e8f0' }: { label: string; content: string; color?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: '#8892a4', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
        {label}
      </div>
      <div style={{ fontSize: 14, color: '#c8d0dc', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{content}</div>
    </div>
  )
}
