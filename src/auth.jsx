import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// 아이디로 로그인하지만 Supabase 는 이메일 형식이 필요해서, 아이디를 내부용 주소로 바꾼다.
// 실제로 메일이 가지 않는 주소다.
const EMAIL_DOMAIN = 'users.daerim-desk.app'
export const idToEmail = (id) => `${id.trim().toLowerCase()}@${EMAIL_DOMAIN}`
export const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,19}$/

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = 확인 중
  const [profile, setProfile] = useState(null)
  const [profileReady, setProfileReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  async function loadProfile(uid) {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile(data)
    setProfileReady(true)
  }

  useEffect(() => {
    if (session?.user) loadProfile(session.user.id)
    else { setProfile(null); setProfileReady(false) }
  }, [session?.user?.id])

  const value = {
    session,
    profile,
    loading: session === undefined || (Boolean(session) && !profileReady),
    reloadProfile: () => session?.user && loadProfile(session.user.id),
    signOut: () => supabase.auth.signOut(),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

const KO_ERRORS = [
  [/Invalid login credentials/i, '아이디 또는 비밀번호가 맞지 않습니다.'],
  [/already registered|already exists/i, '이미 쓰고 있는 아이디입니다.'],
  [/Password should be at least/i, '비밀번호는 6자 이상이어야 합니다.'],
  [/rate limit/i, '잠시 후 다시 시도해 주세요.'],
  [/should be different from the old password/i, '지금 비밀번호와 다른 비밀번호를 적어 주세요.'],
  [/Email not confirmed/i, '이메일 인증 설정이 켜져 있습니다. 관리자에게 알려주세요.'],
]
export const toKorean = (msg) => (KO_ERRORS.find(([re]) => re.test(msg))?.[1]) ?? `문제가 생겼습니다: ${msg}`

// 세부 권한 (profiles.perms). 관리자는 notice 를 가진다. 주보 광고는 누구나 정리할 수 있어 권한이 없다.
// 심방보고는 관리자라도 따로 받아야 한다 (성도 개인정보).
export const PERMS = [
  { key: 'notice', name: '공지 작성', hint: '공지 쓰기·고치기, 알림 보내기' },
]
export function can(profile, key) {
  if (!profile || profile.status !== 'approved') return false
  if (profile.role === 'admin' && !key.startsWith('visit')) return true
  return (profile.perms ?? []).includes(key)
}
// 볼 수 있는 심방보고(교구 부서 id 목록)
export function visitRooms(profile, departments) {
  const parishes = departments.filter((d) => d.grp === 'parish')
  if (can(profile, 'visit_all')) return parishes
  return parishes.filter((d) => can(profile, `visit:${d.id}`))
}
