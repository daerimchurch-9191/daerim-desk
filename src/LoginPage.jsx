import { useState } from 'react'
import { supabase, idToEmail, ID_PATTERN, toKorean, useAuth } from './auth.jsx'

const logoWhite = new URL('../public/logo-white.png', import.meta.url).href

function Shell({ children }) {
  return (
    <div className="auth">
      <div className="auth-side">
        <img className="logo" src={logoWhite} alt="대림교회 로고" />
        <span className="display auth-title">MINISTRY DESK</span>
        <span className="auth-sub">대림교회 사역 대시보드</span>
      </div>
      <div className="auth-main">{children}</div>
    </div>
  )
}

export function LoginPage() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ id: '', pw: '', pw2: '', name: '', title: '전도사', dept: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError('')
    const id = form.id.trim().toLowerCase()
    if (!ID_PATTERN.test(id)) return setError('아이디는 영어 소문자·숫자로 3~20자로 적어 주세요.')
    if (mode === 'signup') {
      if (!form.name.trim()) return setError('이름을 적어 주세요.')
      if (form.pw.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.')
      if (form.pw !== form.pw2) return setError('비밀번호 확인이 맞지 않습니다.')
    }
    setBusy(true)
    const res = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email: idToEmail(id), password: form.pw })
      : await supabase.auth.signUp({
          email: idToEmail(id),
          password: form.pw,
          options: { data: { login_id: id, name: form.name.trim(), title: form.title.trim() || '전도사', dept: form.dept.trim() || null } },
        })
    setBusy(false)
    if (res.error) setError(toKorean(res.error.message))
  }

  const isSignup = mode === 'signup'
  return (
    <Shell>
      <form className="auth-card" onSubmit={submit}>
        <h1 className="pill">{isSignup ? '가입 신청' : '로그인'}</h1>
        {isSignup && <p className="muted small">가입을 신청하면 관리자가 승인한 뒤부터 쓸 수 있습니다.</p>}
        <label className="field">아이디
          <input value={form.id} onChange={set('id')} autoComplete="username" autoCapitalize="none" placeholder="영어 소문자·숫자 3~20자" />
        </label>
        {isSignup && (
          <>
            <label className="field">이름<input value={form.name} onChange={set('name')} placeholder="예: 박수아" /></label>
            <div className="field-row">
              <label className="field">직분<input value={form.title} onChange={set('title')} /></label>
              <label className="field">소속 부서<input value={form.dept} onChange={set('dept')} placeholder="예: 유년부" /></label>
            </div>
          </>
        )}
        <label className="field">비밀번호
          <input type="password" value={form.pw} onChange={set('pw')} autoComplete={isSignup ? 'new-password' : 'current-password'} />
        </label>
        {isSignup && (
          <label className="field">비밀번호 확인
            <input type="password" value={form.pw2} onChange={set('pw2')} autoComplete="new-password" />
          </label>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? '잠시만요…' : isSignup ? '가입 신청하기' : '로그인'}
        </button>
        <button type="button" className="link-btn" onClick={() => { setMode(isSignup ? 'login' : 'signup'); setError('') }}>
          {isSignup ? '이미 계정이 있어요. 로그인하기' : '처음이에요. 가입 신청하기'}
        </button>
        {!isSignup && <p className="muted small">비밀번호를 잊으셨으면 관리자에게 초기화를 부탁하세요.</p>}
      </form>
    </Shell>
  )
}

export function WaitingPage() {
  const { profile, signOut, reloadProfile } = useAuth()
  const rejected = profile?.status === 'rejected'
  return (
    <Shell>
      <div className="auth-card">
        <h1 className="pill">{rejected ? '가입이 반려되었습니다' : '승인을 기다리고 있습니다'}</h1>
        <p>
          <strong>{profile?.name} {profile?.title}님</strong>
          {rejected
            ? ', 가입 신청이 반려되었습니다. 관리자에게 문의해 주세요.'
            : ', 가입 신청이 접수되었습니다. 관리자가 승인하면 바로 쓸 수 있습니다.'}
        </p>
        {!rejected && <button type="button" className="btn btn-primary btn-block" onClick={reloadProfile}>승인되었는지 다시 확인</button>}
        <button type="button" className="btn btn-block" onClick={signOut}>로그아웃</button>
      </div>
    </Shell>
  )
}
