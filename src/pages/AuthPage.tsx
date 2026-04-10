import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/useAuthStore'
import { getRegistrationOpen } from '../lib/supabase'
import { Mail, Lock, Eye, EyeOff, TrendingUp } from 'lucide-react'

function genCaptcha() {
  const a = Math.floor(Math.random() * 10) + 1
  const b = Math.floor(Math.random() * 10) + 1
  return { a, b, answer: String(a + b) }
}

export default function AuthPage() {
  const { signIn, signUp, loading } = useAuthStore()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null)

  useEffect(() => {
    getRegistrationOpen().then(setRegistrationOpen)
  }, [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [captcha, setCaptcha] = useState(genCaptcha)
  const [captchaInput, setCaptchaInput] = useState('')

  const switchMode = (m: 'login' | 'register') => {
    setMode(m)
    setError('')
    setSuccess('')
    setCaptcha(genCaptcha())
    setCaptchaInput('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (captchaInput.trim() !== captcha.answer) {
      setError('验证码错误，请重新计算')
      setCaptcha(genCaptcha())
      setCaptchaInput('')
      return
    }

    if (mode === 'register') {
      if (password.length < 6) { setError('密码至少 6 位'); return }
      if (password !== confirm) { setError('两次密码不一致'); return }
      const err = await signUp(email, password)
      if (err) {
        setError(err)
        setCaptcha(genCaptcha())
        setCaptchaInput('')
      } else {
        setSuccess('注册成功！请检查邮箱，点击验证链接后登录。')
      }
    } else {
      const err = await signIn(email, password)
      if (err) {
        if (err.includes('Invalid login')) setError('邮箱或密码错误')
        else if (err.includes('Email not confirmed')) setError('请先验证邮箱，检查收件箱')
        else setError(err)
        setCaptcha(genCaptcha())
        setCaptchaInput('')
      }
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px 10px 38px',
    background: '#22263a', border: '1px solid #2d3148',
    borderRadius: 10, color: '#e2e8f0', fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0f1117',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 12px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <TrendingUp size={28} color="#fff" />
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#e2e8f0' }}>TradeInsight</h1>
          <p style={{ margin: '4px 0 0', color: '#8892a4', fontSize: 14 }}>多品种金融交易记录分析平台</p>
        </div>

        {/* Card */}
        <div style={{
          background: '#1a1d27', border: '1px solid #2d3148',
          borderRadius: 16, padding: '28px 28px 24px',
        }}>
          {/* Tabs */}
          <div style={{
            display: 'flex', background: '#22263a',
            borderRadius: 10, padding: 4, marginBottom: 24,
          }}>
            <button onClick={() => switchMode('login')}
              style={{
                flex: 1, padding: '8px', borderRadius: 8, border: 'none',
                cursor: 'pointer', fontSize: 14, fontWeight: mode === 'login' ? 600 : 400,
                background: mode === 'login' ? '#1a1d27' : 'transparent',
                color: mode === 'login' ? '#e2e8f0' : '#8892a4',
                transition: 'all 0.15s',
              }}>
              登录
            </button>
            <button
              onClick={() => registrationOpen !== false && switchMode('register')}
              title={registrationOpen === false ? '管理员已关闭注册' : undefined}
              style={{
                flex: 1, padding: '8px', borderRadius: 8, border: 'none',
                cursor: registrationOpen === false ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: mode === 'register' ? 600 : 400,
                background: mode === 'register' ? '#1a1d27' : 'transparent',
                color: registrationOpen === false ? '#4a5268' : mode === 'register' ? '#e2e8f0' : '#8892a4',
                transition: 'all 0.15s',
                opacity: registrationOpen === false ? 0.5 : 1,
              }}>
              注册{registrationOpen === false ? '（已关闭）' : ''}
            </button>
          </div>

          {/* Registration closed notice */}
          {registrationOpen === false && mode === 'register' && (
            <div style={{
              background: '#f59e0b15', border: '1px solid #f59e0b40',
              borderLeft: '3px solid #f59e0b',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16,
              fontSize: 13, color: '#fbbf24',
            }}>
              管理员已暂停开放注册，如需账号请联系管理员。
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, opacity: (registrationOpen === false && mode === 'register') ? 0.4 : 1, pointerEvents: (registrationOpen === false && mode === 'register') ? 'none' : undefined }}>
            {/* Email */}
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#4a5268' }} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="邮箱地址" required autoComplete="email" style={inp} />
            </div>

            {/* Password */}
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#4a5268' }} />
              <input type={showPwd ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码（至少 6 位）" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                style={{ ...inp, paddingRight: 40 }} />
              <button type="button" onClick={() => setShowPwd((v) => !v)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#4a5268', padding: 0 }}>
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {/* Confirm password */}
            {mode === 'register' && (
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#4a5268' }} />
                <input type={showPwd ? 'text' : 'password'} value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="确认密码" required autoComplete="new-password"
                  style={inp} />
              </div>
            )}

            {/* Math CAPTCHA */}
            <div style={{
              background: '#22263a', border: '1px solid #2d3148',
              borderRadius: 10, padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ color: '#e2e8f0', fontSize: 15, whiteSpace: 'nowrap' }}>
                {captcha.a} + {captcha.b} = ?
              </span>
              <input
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="输入答案"
                maxLength={3}
                style={{
                  flex: 1, padding: '6px 10px',
                  background: '#1a1d27', border: '1px solid #2d3148',
                  borderRadius: 8, color: '#e2e8f0', fontSize: 14,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => { setCaptcha(genCaptcha()); setCaptchaInput('') }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#4a5268', fontSize: 12, whiteSpace: 'nowrap', padding: 0,
                }}
              >
                换一题
              </button>
            </div>

            {/* Error / Success */}
            {error && (
              <div style={{ background: '#ef444420', border: '1px solid #ef444440', borderRadius: 8, padding: '8px 12px', color: '#f87171', fontSize: 13 }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ background: '#22c55e20', border: '1px solid #22c55e40', borderRadius: 8, padding: '8px 12px', color: '#4ade80', fontSize: 13 }}>
                {success}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              padding: '11px', borderRadius: 10, border: 'none',
              background: loading ? '#2d3148' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: '#fff', cursor: loading ? 'default' : 'pointer',
              fontSize: 15, fontWeight: 600, marginTop: 2,
            }}>
              {loading ? '处理中...' : mode === 'login' ? '登录' : '创建账号'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#4a5268', fontSize: 12, marginTop: 16 }}>
          注册即代表同意服务条款 · 数据加密存储
        </p>
      </div>
    </div>
  )
}
