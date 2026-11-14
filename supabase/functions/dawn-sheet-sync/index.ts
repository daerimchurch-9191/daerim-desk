// 구글 시트 "새벽 기도 담당표" ↔ 대시보드 새벽 설교(sermons, service='dawn') 양방향 연동.
// 시트 안의 Apps Script가 시트를 고칠 때마다, 그리고 10분마다 시트 내용 전체를 보낸다: { rows: [{ date, passage, name }] }
// 마지막으로 맞춘 값(sheet_sync_state)과 비교해서
//  - 시트가 바뀐 날짜 → 대시보드에 반영 (둘 다 바뀌었으면 시트가 이긴다)
//  - 대시보드만 바뀐 날짜 → 시트에 써 넣을 값을 돌려준다: { writes: [{ date, passage, name }] }
// 요청 머리에 x-sync-token(관리자 화면의 "시트 연동 열쇠")이 맞아야 한다.
// Supabase 에 배포된 함수(dawn-sheet-sync)와 같은 내용이다.
import { createClient } from 'npm:@supabase/supabase-js@2'

type Val = { passage: string; name: string }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
const same = (a: string, b: string) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0 }
const norm = (v: Val | null | undefined) => v ? `${(v.passage ?? '').replace(/\s+/g, '')}|${(v.name ?? '').replace(/\s+/g, '')}` : '|'
const empty = (v: Val) => !v.passage.trim() && !v.name.trim()

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: token } = await db.rpc('get_sheet_token')
  const given = req.headers.get('x-sync-token') ?? ''
  if (!token || !given || !same(given, token)) return json({ error: '시트 연동 열쇠가 맞지 않습니다.' }, 401)

  let rows: { date: string; passage?: string; name?: string }[]
  try { rows = (await req.json()).rows } catch { return json({ error: '요청 형식이 잘못되었습니다.' }, 400) }
  rows = (rows ?? []).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)).slice(0, 800)
  if (!rows.length) return json({ writes: [], to_dashboard: 0 })
  const dates = rows.map((r) => r.date)

  const [{ data: states }, { data: sermons }, { data: people }] = await Promise.all([
    db.from('sheet_sync_state').select('*').in('date', dates),
    db.from('sermons').select('id, date, preacher_id, preacher_name, passage').eq('service', 'dawn').in('date', dates),
    db.from('profiles').select('id, name, title').eq('status', 'approved'),
  ])
  const stateOf = new Map((states ?? []).map((s) => [s.date, { passage: s.passage, name: s.name }]))
  const sermonOf = new Map((sermons ?? []).map((s) => [s.date, s]))
  const nameOfId = new Map((people ?? []).map((p) => [p.id, p.name]))
  const findPerson = (n: string) => {
    const k = n.replace(/\s+/g, '')
    return (people ?? []).find((p) => p.name.replace(/\s+/g, '') === k || `${p.name}${p.title ?? ''}`.replace(/\s+/g, '') === k)
  }
  const dbVal = (date: string): Val => {
    const s = sermonOf.get(date)
    if (!s) return { passage: '', name: '' }
    return { passage: s.passage ?? '', name: s.preacher_id ? (nameOfId.get(s.preacher_id) ?? s.preacher_name ?? '') : (s.preacher_name ?? '') }
  }

  const writes: (Val & { date: string })[] = []
  const newState: (Val & { date: string; synced_at: string })[] = []
  let toDash = 0
  const now = new Date().toISOString()

  for (const r of rows) {
    const sv: Val = { passage: (r.passage ?? '').trim(), name: (r.name ?? '').trim() }
    const dv = dbVal(r.date)
    const last = stateOf.get(r.date)
    let winner: 'sheet' | 'db' | null = null
    if (!last) winner = !empty(sv) ? 'sheet' : (!empty(dv) ? 'db' : null)
    else if (norm(sv) !== norm(last)) winner = 'sheet'
    else if (norm(dv) !== norm(last)) winner = 'db'

    if (winner === 'sheet') {
      if (norm(sv) !== norm(dv)) {
        const s = sermonOf.get(r.date)
        if (empty(sv)) {
          if (s) await db.from('sermons').delete().eq('id', s.id)
        } else {
          const p = sv.name ? findPerson(sv.name) : undefined
          const row = { passage: sv.passage || null, preacher_id: p?.id ?? null, preacher_name: p ? null : (sv.name || null) }
          if (s) await db.from('sermons').update(row).eq('id', s.id)
          else await db.from('sermons').insert({ ...row, service: 'dawn', date: r.date, is_public: true })
        }
        toDash++
      }
      newState.push({ date: r.date, ...sv, synced_at: now })
    } else if (winner === 'db') {
      if (norm(dv) !== norm(sv)) writes.push({ date: r.date, ...dv })
      newState.push({ date: r.date, ...dv, synced_at: now })
    }
  }
  if (newState.length) await db.from('sheet_sync_state').upsert(newState, { onConflict: 'date' })
  await db.from('sheet_sync_runs').insert({ to_dashboard: toDash, to_sheet: writes.length })
  await db.from('sheet_sync_runs').delete().lt('at', new Date(Date.now() - 14 * 86400000).toISOString())
  return json({ writes, to_dashboard: toDash })
})
