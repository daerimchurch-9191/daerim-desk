// 공지 알림을 휴대폰·컴퓨터로 보낸다 (웹 푸시).
// - { notice_id }: 관리자 또는 공지 작성 권한(notice)이 있는 사람만. 그 공지의 받는 범위(전체·교구·교육부)에 맞는 승인된 사역자에게 보낸다. 쓴 사람은 뺀다.
// - { test: true }: 누구나. 부른 사람 자기 기기에만 시험 알림을 보낸다.
// - { subscribe: {endpoint, keys} }: 이 기기를 부른 사람의 알림 기기로 등록한다 (같은 기기를 다른 사람이 쓰던 경우도 넘겨받는다).
// 푸시 비밀 키는 데이터베이스 금고(vault)에 있고, service_role 만 꺼낼 수 있다.
// Supabase 에 배포된 함수(notify-notice)와 같은 내용이다.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC = 'BMJrL3BqJ7IZ4GttnwRxyGH_gCaVrPMMt1qoZXs5wE3IgayiKZtGwY5kVFKw1Icr5A3yC8_S73U7JwPydfs1ihk'
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
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: who } = await admin.auth.getUser(token)
  if (!who?.user) return reply({ error: '로그인이 필요합니다.' }, 401)
  const { data: me } = await admin.from('profiles').select('id, role, status, perms').eq('id', who.user.id).maybeSingle()
  if (!me || me.status !== 'approved') return reply({ error: '승인된 사역자만 쓸 수 있습니다.' }, 403)

  let body: { notice_id?: number; test?: boolean; subscribe?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } }
  try { body = await req.json() } catch { return reply({ error: '요청 형식이 잘못되었습니다.' }, 400) }

  if (body.subscribe) {
    const { endpoint, keys } = body.subscribe
    if (!endpoint?.startsWith('https://') || !keys?.p256dh || !keys?.auth) return reply({ error: '기기 정보가 잘못되었습니다.' }, 400)
    const { error } = await admin.from('push_subscriptions')
      .upsert({ user_id: me.id, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' })
    if (error) return reply({ error: error.message }, 400)
    return reply({ ok: true })
  }

  const { data: key } = await admin.rpc('get_vapid_private_key')
  if (!key) return reply({ error: '알림 키가 설정되지 않았습니다.' }, 500)
  webpush.setVapidDetails('https://www.drmch.kr', VAPID_PUBLIC, key)

  let userIds: string[]
  let payload: { title: string; body: string; url: string; tag: string }
  if (body.test) {
    userIds = [me.id]
    payload = { title: '대림교회 사역 데스크', body: '알림이 잘 켜졌습니다.', url: './#home', tag: 'test' }
  } else {
    if (me.role !== 'admin' && !(me.perms ?? []).includes('notice')) return reply({ error: '공지 작성 권한이 있어야 알림을 보낼 수 있습니다.' }, 403)
    const { data: n } = await admin.from('notices').select('id, title, body, audience, created_by').eq('id', body.notice_id ?? -1).maybeSingle()
    if (!n) return reply({ error: '공지를 찾을 수 없습니다.' }, 404)
    const [{ data: people }, { data: depts }] = await Promise.all([
      admin.from('profiles').select('id, dept, role').eq('status', 'approved'),
      admin.from('departments').select('name, grp'),
    ])
    const grp = new Map((depts ?? []).map((d) => [d.name, d.grp]))
    userIds = (people ?? [])
      .filter((p) => p.id !== n.created_by)
      .filter((p) => n.audience === 'all' || p.role === 'admin' || grp.get(p.dept) === n.audience)
      .map((p) => p.id)
    const text = (n.body ?? '').replace(/\s+/g, ' ').trim()
    payload = { title: `[공지] ${n.title}`, body: text.length > 120 ? text.slice(0, 120) + '…' : text, url: './#notices', tag: `notice-${n.id}` }
  }
  if (!userIds.length) return reply({ ok: true, sent: 0, devices: 0 })

  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', userIds)
  let sent = 0
  const dead: number[] = []
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 })
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) dead.push(s.id) // 알림을 끈 기기
    }
  }))
  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead)
  return reply({ ok: true, sent, devices: subs?.length ?? 0 })
})
