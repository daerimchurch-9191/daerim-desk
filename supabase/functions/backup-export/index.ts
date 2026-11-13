// 자동 백업: 교회 컴퓨터(또는 나스)가 매일 불러서 모든 표를 JSON 한 파일로 받아 간다.
// 요청 머리에 x-backup-token(관리자 화면의 "백업 열쇠")이 맞아야 한다. 열쇠는 금고(vault)에 있다.
// 비밀번호는 백업에 들어가지 않는다 (복원하면 사역자들은 비밀번호를 다시 정해야 한다).
// Supabase 에 배포된 함수(backup-export)와 같은 내용이다.
import { createClient } from 'npm:@supabase/supabase-js@2'

const TABLES = ['departments', 'profiles', 'events', 'sermons', 'vehicles', 'vehicle_bookings', 'todos',
  'notices', 'notice_reads', 'bulletin_ads', 'visit_messages', 'folders', 'backup_runs']

const same = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let x = 0
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return x === 0
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const given = req.headers.get('x-backup-token') ?? ''
  const { data: token } = await admin.rpc('get_backup_token')
  if (!token || !given || !same(given, token)) return new Response(JSON.stringify({ error: '백업 열쇠가 맞지 않습니다.' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const out: Record<string, unknown> = { app: 'daerim-desk', version: 1, exported_at: new Date().toISOString(), tables: {} }
  let rows = 0
  for (const t of TABLES) {
    const all: unknown[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin.from(t).select('*').range(from, from + 999)
      if (error) return new Response(JSON.stringify({ error: `${t}: ${error.message}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
      all.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    ;(out.tables as Record<string, unknown>)[t] = all
    rows += all.length
  }
  // 로그인 계정 목록 (비밀번호 제외)
  const users: unknown[] = []
  for (let page = 1; ; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    const list = data?.users ?? []
    users.push(...list.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at })))
    if (list.length < 1000) break
  }
  out.auth_users = users

  const body = JSON.stringify(out)
  await admin.from('backup_runs').insert({ rows, bytes: body.length })
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } })
})
