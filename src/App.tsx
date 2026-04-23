import { useEffect, useState } from 'react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Trades from './pages/Trades'
import Positions from './pages/Positions'
import Analytics from './pages/Analytics'
import Journal from './pages/Journal'
import AuthPage from './pages/AuthPage'
import Profile from './pages/Profile'
import { ChartPage } from './pages/ChartPage'
import PlansPage from './pages/PlansPage'
import PlanDetailPage from './pages/PlanDetailPage'
import ErrorBoundary from './components/ErrorBoundary'
import { useTradeStore } from './store/useTradeStore'
import { useAuthStore } from './store/useAuthStore'
import { useJournalStore } from './store/useJournalStore'

export default function App() {
  const {
    view, syncFromCloud, clearUserData, cloudSynced,
    syncPlansFromCloud, clearPlans, expirePlans,
  } = useTradeStore()
  const { user, initialized, init } = useAuthStore()
  const { syncFromCloud: syncJournal, clearJournal } = useJournalStore()
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    init()
  }, [])

  // 启动时被动扫描一次过期 Plan（spec §6.2）
  useEffect(() => {
    expirePlans()
  }, [])

  // Sync cloud data when user changes.
  // Guard: do nothing until auth is initialized — user=null before init() resolves
  // means "not yet loaded", not "logged out". Calling clearUserData() here would
  // wipe localStorage-persisted trades before syncFromCloud() can merge them.
  useEffect(() => {
    if (!initialized) return
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSyncing(true)
      Promise.all([
        syncFromCloud(user.id),
        syncJournal(user.id),
        syncPlansFromCloud(user.id),
      ]).catch((e) => console.error('[sync] initial sync failed', e))
        .finally(() => setSyncing(false))
    } else {
      clearUserData()
      clearJournal()
      clearPlans()
    }
  }, [user?.id, initialized])

  if (!initialized || (user && syncing && !cloudSynced)) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0f1117',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: '#8892a4', fontSize: 14, gap: 12,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '3px solid #2d3148', borderTopColor: '#3b82f6',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        {user ? '正在同步数据...' : '加载中...'}
      </div>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  const pages: Record<string, React.ReactNode> = {
    dashboard: <Dashboard />,
    trades: <Trades />,
    positions: <Positions />,
    analytics: <Analytics />,
    journal: <Journal />,
    profile: <Profile />,
    chart: <ChartPage />,
    plans: <PlansPage />,
    planDetail: <PlanDetailPage />,
  }

  return (
    <ErrorBoundary>
      <Layout>
        <ErrorBoundary>
          {pages[view] || <Dashboard />}
        </ErrorBoundary>
      </Layout>
    </ErrorBoundary>
  )
}
