// 관리자가 다른 사역자의 비밀번호를 새로 정해 준다.
// 부른 사람이 승인된 관리자인지 확인한 뒤에만 바꾼다. service_role 키는 이 함수 안에서만 쓴다.
// Supabase 에 배포된 함수(reset-password)와 같은 내용이다.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: '허용되지 않는 요청입니다.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // 1. 부른 사람 확인
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: who, error: whoErr } = await admin.auth.getUser(token)
  if (whoErr || !who?.user) return reply({ error: '로그인이 필요합니다.' }, 401)
  const { data: me } = await admin.from('profiles').select('role, status').eq('id', who.user.id).maybeSingle()
  if (!me || me.role !== 'admin' || me.status !== 'approved') return reply({ error: '관리자만 비밀번호를 초기화할 수 있습니다.' }, 403)

  // 2. 입력 확인
  let body: { user_id?: string; password?: string }
  try { body = await req.json() } catch { return reply({ error: '요청 형식이 잘못되었습니다.' }, 400) }
  const { user_id, password } = body
  if (!user_id || typeof password !== 'string') return reply({ error: '대상과 새 비밀번호가 필요합니다.' }, 400)
  if (password.length < 6) return reply({ error: '비밀번호는 6자 이상이어야 합니다.' }, 400)
  const { data: target } = await admin.from('profiles').select('id').eq('id', user_id).maybeSingle()
  if (!target) return reply({ error: '해당 사역자를 찾을 수 없습니다.' }, 404)

  // 3. 바꾸기
  const { error } = await admin.auth.admin.updateUserById(user_id, { password })
  if (error) return reply({ error: error.message }, 400)
  return reply({ ok: true })
})
