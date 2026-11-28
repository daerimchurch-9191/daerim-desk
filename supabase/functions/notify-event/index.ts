// 새 내용 알림 (웹 푸시). 데이터베이스 트리거(kick_notify)가 새 글이 생길 때 부른다.
// { type: 'visit' | 'ads' | 'cars' | 'calendar' | 'leave_new' | 'leave_decided' | 'attendance', id }
//  - 출석: 한 주일의 열 칸이 다 채워지면 한 번 (attendance_weeks id). 다 채운 사람은 뺀다.
// 받을 사람: 각자 알림 설정(notification_prefs, 없으면 기본값)에서 그 항목을 켠 승인된 사역자. 쓴 사람은 뺀다.
//  - 심방보고: 그 교구 방 권한이 있는 사람만. 성도 개인정보라 내용은 알림에 넣지 않는다.
//  - 캘린더: 교회 전체 / 내 부서 / 교육부 중 켠 것. 교구 일정은 그 교구 소속에게만. 개인 일정은 알리지 않는다.
//  - 연차: 새 신청은 연차 관리자(관리자 포함)에게, 승인·반려는 신청한 사람에게.
// 요청 머리에 x-notify-token(금고 notify_token)이 맞아야 한다.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC = 'BMJrL3BqJ7IZ4GttnwRxyGH_gCaVrPMMt1qoZXs5wE3IgayiKZtGwY5kVFKw1Icr5A3yC8_S73U7JwPydfs1ihk'
const DEFAULTS = { notice: true, visit: true, ads: true, cars: true, leave: true, cal_all: true, cal_mine: true, cal_edu: false, cal_parish: false, attendance: true }
type Prefs = typeof DEFAULTS
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0 }
const KST = 9 * 3600000
const md = (t: string | Date) => { const d = new Date(new Date(t).getTime() + KST); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}` }
const hm = (t: string | Date) => new Date(new Date(t).getTime() + KST).toISOString().slice(11, 16)
const cut = (s: string, n = 80) => { const t = (s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t }
const span = (r: string) => { const m = r.match(/^[\[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/); return m ? [m[1], m[2]].map((x) => x.replace(' ', 'T').replace(/\+00$/, 'Z')) : [r, r] }

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: token } = await db.rpc('get_notify_token')
  const given = req.headers.get('x-notify-token') ?? ''
  if (!token || !given || !same(given, token)) return json({ error: 'unauthorized' }, 401)
  let body: { type?: string; id?: number }
  try { body = await req.json() } catch { return json({ error: 'bad request' }, 400) }
  const { type, id } = body
  if (!type || !id) return json({ error: 'bad request' }, 400)

  const [{ data: people }, { data: prefRows }, { data: depts }, { data: links }] = await Promise.all([
    db.from('profiles').select('id, name, title, role, perms').eq('status', 'approved'),
    db.from('notification_prefs').select('*'),
    db.from('departments').select('id, name, grp'),
    db.from('profile_depts').select('profile_id, dept_id'),
  ])
  const prefs = new Map((prefRows ?? []).map((p) => [p.profile_id, p as Prefs]))
  const pref = (uid: string): Prefs => prefs.get(uid) ?? DEFAULTS
  const dept = new Map((depts ?? []).map((d) => [d.id, d]))
  const myDepts = (uid: string) => (links ?? []).filter((l) => l.profile_id === uid).map((l) => l.dept_id)
  const who = (uid: string | null) => { const p = (people ?? []).find((x) => x.id === uid); return p ? `${p.name} ${p.title ?? ''}`.trim() : '' }
  const has = (p: { role: string; perms: string[] | null }, k: string) => (p.perms ?? []).includes(k)

  let to: string[] = []
  let payload: { title: string; body: string; url: string; tag: string } | null = null
  const all = people ?? []

  if (type === 'visit') {
    const { data: m } = await db.from('visit_messages').select('id, dept_id, created_by').eq('id', id).maybeSingle()
    if (!m) return json({ skipped: 'gone' })
    to = all.filter((p) => p.id !== m.created_by && pref(p.id).visit && (has(p, 'visit_all') || has(p, `visit:${m.dept_id}`))).map((p) => p.id)
    payload = { title: `[심방보고] ${dept.get(m.dept_id)?.name ?? ''}`, body: `${who(m.created_by) || '사역자'}님이 새 심방보고를 남겼습니다.`, url: './#visits', tag: `visit-${m.dept_id}` }
  } else if (type === 'ads') {
    const { data: a } = await db.from('bulletin_ads').select('id, title, body, week_of, created_by').eq('id', id).maybeSingle()
    if (!a) return json({ skipped: 'gone' })
    to = all.filter((p) => p.id !== a.created_by && pref(p.id).ads).map((p) => p.id)
    payload = { title: `[주보 광고] ${cut(a.title, 40)}`, body: `${md(a.week_of)} 주보 · ${who(a.created_by)}${a.body ? ' — ' + cut(a.body, 60) : ''}`, url: './#ads', tag: `ads-${a.id}` }
  } else if (type === 'cars') {
    const { data: b } = await db.from('vehicle_bookings').select('id, vehicle_id, during, dept_id, dept_text, requester, created_by').eq('id', id).maybeSingle()
    if (!b) return json({ skipped: 'gone' })
    const { data: v } = await db.from('vehicles').select('name').eq('id', b.vehicle_id).maybeSingle()
    const [s, e] = span(b.during)
    const d = b.dept_text || (b.dept_id ? dept.get(b.dept_id)?.name : '') || ''
    to = all.filter((p) => p.id !== b.created_by && pref(p.id).cars).map((p) => p.id)
    payload = { title: `[차량] ${v?.name ?? '차량'} 신청`, body: `${md(s)} ${hm(s)}–${hm(e)}${d ? ' · ' + d : ''}${b.requester ? ' · ' + b.requester : ''}`, url: './#cars', tag: `car-${b.id}` }
  } else if (type === 'calendar') {
    const { data: ev } = await db.from('events').select('id, title, starts_at, all_day, dept_id, created_by').eq('id', id).maybeSingle()
    if (!ev || ev.dept_id === 'personal') return json({ skipped: 'personal' })
    const grp = dept.get(ev.dept_id)?.grp
    to = all.filter((p) => {
      if (p.id === ev.created_by) return false
      const f = pref(p.id)
      if (ev.dept_id === 'all') return f.cal_all
      if (f.cal_mine && myDepts(p.id).includes(ev.dept_id)) return true
      // "교육부"(교육부 전체) 일정은 교육부 소속 누구에게나 내 부서 일정
      if (f.cal_mine && ev.dept_id === 'edu' && myDepts(p.id).some((d) => dept.get(d)?.grp === 'edu')) return true
      // 교구 일정은 그 교구 소속에게만 (위 '내 부서 일정'에서 처리)
      return grp === 'edu' && f.cal_edu
    }).map((p) => p.id)
    payload = { title: `[캘린더] ${cut(ev.title, 40)}`, body: `${md(ev.starts_at)}${ev.all_day ? ' 종일' : ' ' + hm(ev.starts_at)} · ${dept.get(ev.dept_id)?.name ?? ''}`, url: './#calendar', tag: `event-${ev.id}` }
  } else if (type === 'leave_new' || type === 'leave_decided') {
    const { data: r } = await db.from('leave_requests').select('id, profile_id, start_date, end_date, part, days, status').eq('id', id).maybeSingle()
    if (!r) return json({ skipped: 'gone' })
    const when = r.start_date === r.end_date ? md(r.start_date) : `${md(r.start_date)}~${md(r.end_date)}`
    const kind = r.part === 'am' ? '오전 반차' : r.part === 'pm' ? '오후 반차' : `연차 ${Number(r.days)}일`
    if (type === 'leave_new') {
      to = all.filter((p) => p.id !== r.profile_id && pref(p.id).leave && (p.role === 'admin' || has(p, 'leave_admin'))).map((p) => p.id)
      payload = { title: '[연차] 새 신청', body: `${who(r.profile_id)} · ${when} ${kind}`, url: './#leave/admin', tag: `leave-${r.id}` }
    } else {
      to = pref(r.profile_id).leave ? [r.profile_id] : []
      payload = { title: `[연차] ${r.status === 'approved' ? '승인되었습니다' : '반려되었습니다'}`, body: `${when} ${kind}`, url: './#leave', tag: `leave-${r.id}` }
    }
  } else if (type === 'attendance') {
    const { data: w } = await db.from('attendance_weeks').select('id, sunday, completed_by').eq('id', id).maybeSingle()
    if (!w) return json({ skipped: 'gone' })
    const { data: rows } = await db.from('attendance').select('slot, count').eq('sunday', w.sunday)
    const n = (k: string[]) => (rows ?? []).filter((r) => k.includes(r.slot)).reduce((a, r) => a + r.count, 0)
    const adult = n(['p1', 'p2', 'p3', 'youth']), edu = n(['infant_kid', 'infant_parent', 'kinder', 'child', 'elem', 'teen'])
    const [, m, d] = w.sunday.split('-').map(Number)
    to = all.filter((p) => p.id !== w.completed_by && pref(p.id).attendance !== false).map((p) => p.id)
    payload = { title: `[출석] ${m}월 ${d}일 주일 ${(adult + edu).toLocaleString('ko-KR')}명`, body: `장년 ${adult.toLocaleString('ko-KR')} · 교회학교 ${edu.toLocaleString('ko-KR')}`, url: './#attendance', tag: `att-${w.sunday}` }
  } else return json({ error: 'unknown type' }, 400)

  if (!to.length || !payload) return json({ ok: true, sent: 0 })
  const { data: key } = await db.rpc('get_vapid_private_key')
  if (!key) return json({ error: 'no vapid key' }, 500)
  webpush.setVapidDetails('https://www.drmch.kr', VAPID_PUBLIC, key)
  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', to)
  let sent = 0
  const dead: number[] = []
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 24 })
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) dead.push(s.id)
    }
  }))
  if (dead.length) await db.from('push_subscriptions').delete().in('id', dead)
  return json({ ok: true, people: to.length, sent })
})
