// 구글 캘린더 "대림교회 배우는 숲"의 설교 일정 ↔ 대시보드 설교표(sermons) 양방향 연동.
// 캘린더 계정의 Apps Script가 일정이 바뀔 때마다, 그리고 10분마다 범위 안의 일정을 보낸다:
//   { from, to, events: [{ key, kind, date, time, who, tag }] }   (제목이 "새벽 : 이름 직분" 모양인 것만)
// 마지막으로 맞춘 값(calendar_sync_state)과 비교해서
//  - 캘린더가 바뀜 → 대시보드 반영 (둘 다 바뀌면 캘린더가 이긴다), 캘린더에서 지움 → 대시보드에서도 지움
//  - 대시보드만 바뀜 → { updates } 로 캘린더에 쓸 값을 돌려준다, 대시보드에서 지움 → { deletes }
//  - 대시보드에만 있는 오늘 이후 설교 → { creates } (Apps Script가 만들고 sermon 태그를 붙인다)
// 새벽은 구글 시트와도 연동되어 있다: 대시보드가 가운데서 양쪽을 맞춘다.
// 요청 머리에 x-sync-token(관리자 화면의 "캘린더 연동 코드" 안 열쇠)이 맞아야 한다.
import { createClient } from 'npm:@supabase/supabase-js@2'

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0 }
const KIND: Record<string, string> = { 새벽: 'dawn', 수요: 'wed', 금요: 'fri' }
const LABEL: Record<string, string> = { dawn: '새벽', wed: '수요', fri: '금요' }
const DEFAULT_TIME: Record<string, string> = { dawn: '05:00', wed: '11:00', fri: '20:30', special: '11:00' }
const TITLES = '목사|전도사|강도사|장로|권사|집사|사모|선교사|교수|목사님|전도사님'
// 비교용: 띄어쓰기와 뒤에 붙은 직분을 뺀다. "목사"처럼 직분만 있으면 빈칸.
const loose = (s: string | null | undefined) => {
  const t = (s ?? '').trim()
  if (new RegExp(`^(${TITLES})$`).test(t)) return ''
  return t.replace(new RegExp(`\\s+(${TITLES})$`), '').replace(/\s+/g, '')
}
type Ev = { key: string; kind: string; date: string; time: string; who: string; tag?: string | null }
type Sermon = { id: number; service: string; title: string | null; date: string; time: string | null; preacher_id: string | null; preacher_name: string | null; passage: string | null; is_public: boolean }

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: token } = await db.rpc('get_calendar_token')
  const given = req.headers.get('x-sync-token') ?? ''
  if (!token || !given || !same(given, token)) return json({ error: '캘린더 연동 열쇠가 맞지 않습니다.' }, 401)

  let body: { from: string; to: string; today: string; events: Ev[] }
  try { body = await req.json() } catch { return json({ error: '요청 형식이 잘못되었습니다.' }, 400) }
  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!isDate(body.from) || !isDate(body.to) || !isDate(body.today)) return json({ error: '날짜 범위가 없습니다.' }, 400)
  const events = (body.events ?? []).filter((e) => e.key && isDate(e.date) && /^\d{2}:\d{2}$/.test(e.time) && e.kind).slice(0, 3000)

  const [{ data: states }, { data: sermonRows }, { data: people }] = await Promise.all([
    db.from('calendar_sync_state').select('*'),
    db.from('sermons').select('*').in('service', ['dawn', 'wed', 'fri', 'special']).gte('date', body.from).lte('date', body.to),
    db.from('profiles').select('id, name, title').eq('status', 'approved'),
  ])
  const sermons = new Map(((sermonRows ?? []) as Sermon[]).map((s) => [s.id, s]))
  const stateByKey = new Map((states ?? []).map((s) => [s.event_key, s]))
  const person = new Map((people ?? []).map((p) => [p.id, p]))
  const findPerson = (n: string) => {
    const k = loose(n)
    return k ? (people ?? []).find((p) => p.name.replace(/\s+/g, '') === k || `${p.name}${p.title ?? ''}`.replace(/\s+/g, '') === n.replace(/\s+/g, '')) : undefined
  }

  const serviceOf = (kind: string) => KIND[kind] ?? 'special'
  const hm = (t: string | null) => (t ?? '').slice(0, 5)
  // 비교 값: 예배|제목|날짜|시간|사람
  const evVal = (e: Ev) => { const sv = serviceOf(e.kind); return `${sv}|${sv === 'special' ? e.kind : ''}|${e.date}|${e.time}|${loose(e.who)}` }
  const whoOf = (s: Sermon) => s.preacher_id ? (person.get(s.preacher_id)?.name ?? s.preacher_name ?? '') : (s.preacher_name ?? '')
  const whoFull = (s: Sermon) => { const p = s.preacher_id ? person.get(s.preacher_id) : null; return p ? `${p.name}${p.title ? ' ' + p.title : ''}` : (s.preacher_name ?? '') }
  const smVal = (s: Sermon) => `${s.service}|${s.service === 'special' ? (s.title ?? '특별') : ''}|${s.date}|${hm(s.time) || DEFAULT_TIME[s.service]}|${loose(whoOf(s))}`
  const toCal = (s: Sermon) => ({
    title: `${s.service === 'special' ? (s.title || '특별') : LABEL[s.service]} : ${whoFull(s) || '미정'}`,
    date: s.date, time: hm(s.time) || DEFAULT_TIME[s.service],
    description: s.passage ? `본문: ${s.passage}` : '',
  })
  const fields = (e: Ev) => {
    const p = findPerson(e.who)
    const sv = serviceOf(e.kind)
    return { service: sv, title: sv === 'special' ? e.kind : null, date: e.date, time: e.time, preacher_id: p?.id ?? null, preacher_name: p ? null : (loose(e.who) ? e.who.trim() : null) }
  }

  const updates: (ReturnType<typeof toCal> & { key: string })[] = []
  const creates: (ReturnType<typeof toCal> & { sermon_id: number })[] = []
  const deletes: string[] = []
  const issues: string[] = []
  const newState: { event_key: string; sermon_id: number; date: string; val: string; synced_at: string }[] = []
  const dropState: string[] = []
  const linked = new Set<number>()
  for (const s of states ?? []) if (s.sermon_id) linked.add(s.sermon_id)
  let toDash = 0
  const now = new Date().toISOString()
  const keep = (e: Ev, s: Sermon, val: string) => { newState.push({ event_key: e.key, sermon_id: s.id, date: e.date, val, synced_at: now }); linked.add(s.id) }

  async function writeSermon(e: Ev, s: Sermon | null): Promise<Sermon | null> {
    const f = fields(e)
    const res = s
      ? await db.from('sermons').update(f).eq('id', s.id).select().single()
      : await db.from('sermons').insert({ ...f, is_public: true }).select().single()
    if (res.error) { issues.push(`${e.date} ${e.kind} ${e.who}: ${res.error.code === '23505' ? '같은 날 같은 예배가 이미 있어 넣지 못함' : res.error.message}`); return null }
    toDash++
    const n = res.data as Sermon; sermons.set(n.id, n); return n
  }

  // 안전장치: 설교 일정을 하나도 못 받았으면 (다른 계정·다른 캘린더에 설치한 경우) 아무것도 만들거나 지우지 않는다
  if (!events.length) {
    await db.from('calendar_sync_runs').insert({ issues: ['캘린더에서 "예배 : 설교자" 일정을 하나도 찾지 못했습니다. 설교표 캘린더가 있는 계정에 설치했는지 확인하세요.'] })
    return json({ updates: [], creates: [], deletes: [], to_dashboard: 0, issues: ['no events'] })
  }

  const seen = new Set<string>()
  for (const e of events) {
    seen.add(e.key)
    const st = stateByKey.get(e.key)
    const ev = evVal(e)
    if (!st) {
      // 처음 보는 일정: 태그(대시보드가 만든 일정) → 같은 날 같은 예배 칸 순서로 짝을 찾는다
      const sv = serviceOf(e.kind)
      let s = e.tag ? sermons.get(Number(e.tag)) ?? null : null
      if (!s && sv !== 'special') s = [...sermons.values()].find((x) => x.service === sv && x.date === e.date && !linked.has(x.id)) ?? null
      if (!s && sv === 'special') s = [...sermons.values()].find((x) => x.service === 'special' && x.date === e.date && (x.title ?? '') === e.kind && !linked.has(x.id)) ?? null
      if (s) {
        if (smVal(s) === ev) keep(e, s, ev)
        else if (!loose(e.who) && loose(whoOf(s))) { updates.push({ key: e.key, ...toCal(s) }); keep(e, s, smVal(s)) }
        else { const n = await writeSermon(e, s); if (n) keep(e, n, smVal(n)) }
      } else if (loose(e.who)) {
        const n = await writeSermon(e, null); if (n) keep(e, n, smVal(n))
      }
      continue
    }
    const s = st.sermon_id ? sermons.get(st.sermon_id) ?? null : null
    if (!s) {
      // 대시보드에서 지웠다 (범위 밖으로 옮긴 경우는 손대지 않음)
      const { data: still } = await db.from('sermons').select('id').eq('id', st.sermon_id).maybeSingle()
      if (still) continue
      if (ev === st.val) { deletes.push(e.key); dropState.push(e.key) }
      else { const n = await writeSermon(e, null); if (n) keep(e, n, smVal(n)) } // 캘린더도 고쳤으면 캘린더가 이긴다
      continue
    }
    if (ev !== st.val) {
      if (!loose(e.who)) {
        // 캘린더에서 이름을 비웠다 → 설교자만 비운다 (본문은 남김)
        await db.from('sermons').update({ preacher_id: null, preacher_name: null, date: e.date, time: e.time }).eq('id', s.id); toDash++
        const n = { ...s, preacher_id: null, preacher_name: null, date: e.date, time: e.time }; sermons.set(s.id, n); keep(e, n, ev)
      } else { const n = await writeSermon(e, s); if (n) keep(e, n, smVal(n)) }
    } else if (smVal(s) !== st.val) {
      updates.push({ key: e.key, ...toCal(s) }); keep(e, s, smVal(s))
    }
  }

  // 캘린더에서 지운 일정 → 대시보드 설교도 지운다 (범위 안의 것만)
  for (const st of states ?? []) {
    if (seen.has(st.event_key) || st.date < body.from || st.date > body.to) continue
    dropState.push(st.event_key)
    const s = st.sermon_id ? sermons.get(st.sermon_id) : null
    if (!s) continue
    if (smVal(s) !== st.val) { creates.push({ sermon_id: s.id, ...toCal(s) }); linked.add(s.id); continue } // 대시보드에서 고친 게 있으면 다시 만든다
    if (s.passage) await db.from('sermons').update({ preacher_id: null, preacher_name: null }).eq('id', s.id)
    else await db.from('sermons').delete().eq('id', s.id)
    toDash++
  }

  // 대시보드에만 있는 오늘 이후 설교 → 캘린더에 새 일정
  for (const s of sermons.values()) {
    if (linked.has(s.id) || s.date < body.today || !s.is_public || !loose(whoOf(s))) continue
    creates.push({ sermon_id: s.id, ...toCal(s) })
  }

  if (dropState.length) await db.from('calendar_sync_state').delete().in('event_key', dropState)
  if (newState.length) await db.from('calendar_sync_state').upsert(newState, { onConflict: 'event_key' })
  await db.from('calendar_sync_runs').insert({ to_dashboard: toDash, to_calendar: updates.length + creates.length + deletes.length, issues })
  await db.from('calendar_sync_runs').delete().lt('at', new Date(Date.now() - 14 * 86400000).toISOString())
  return json({ updates, creates, deletes, to_dashboard: toDash, issues })
})
