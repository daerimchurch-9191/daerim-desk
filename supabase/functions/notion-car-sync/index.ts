// 노션 "차량신청" 데이터베이스 ↔ 대시보드 차량 예약(vehicle_bookings) 양방향 연동.
// - 5분마다(pg_cron) 그리고 대시보드에서 예약이 바뀔 때마다(트리거) 불린다. x-sync-token 이 맞아야 한다.
// - 어제 이후 날짜의 노션 신청을 모두 읽어 비교한다 (지난 기록은 각자 그대로 둔다).
//   노션만 바뀜 → 대시보드에 반영 / 대시보드만 바뀜 → 노션에 반영 / 둘 다 바뀜 → 노션이 이긴다.
//   노션에서 지운 신청 → 대시보드에서도 지움 / 대시보드에서 지운 예약 → 노션 신청을 보관(삭제)하거나 차량만 뺌.
// - 노션 신청 하나에 차량이 여러 대면 대시보드에는 차량마다 예약 하나씩 (같은 notion_page_id).
// - 같은 차량 시간이 겹쳐 대시보드에 넣을 수 없으면 notion_sync_issues 에 남긴다 (관리자 메뉴 → 기타).
// Supabase 에 배포된 함수(notion-car-sync)와 같은 내용이다.
import { createClient } from 'npm:@supabase/supabase-js@2'

const DB_ID = '34bbedb1067680d49fc6e266d8de6dcd'
const P = { title: '신청자명', cars: '차량종류', when: '날짜 및 시간', driver: '운전자명', dept: '신청 부서 및 사유' }
const HOUR = 3600_000, DAY = 24 * HOUR, KST = 9 * HOUR
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const kst = (ms: number) => new Date(ms + KST).toISOString().replace(/\.\d{3}Z$/, '+09:00')
const text = (rt: any[] | undefined) => (rt ?? []).map((t: any) => t.plain_text).join('').trim()
const rich = (s: string | null) => (s ? [{ type: 'text', text: { content: s.slice(0, 1900) } }] : [])

type Booking = { id: number; vehicle_id: number; during: string; requester: string | null; driver: string | null; dept_id: string | null; dept_text: string | null;
  notion_page_id: string | null; notion_edited_at: string | null; notion_synced_at: string | null; updated_at: string }

// tstzrange 문자열 → [시작ms, 끝ms]
const span = (r: string) => { const m = r.match(/^[\[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/); return m ? [Date.parse(m[1].replace(' ', 'T').replace(/\+00$/, 'Z')), Date.parse(m[2].replace(' ', 'T').replace(/\+00$/, 'Z'))] : [NaN, NaN] }
const range = (a: number, b: number) => `[${new Date(a).toISOString()},${new Date(b).toISOString()})`

// 노션 날짜 → [시작ms, 끝ms]. 날짜만 있으면 그날 하루 종일, 끝이 없거나 시작과 같으면 1시간.
function pageSpan(d: any): [number, number] | null {
  if (!d?.start) return null
  if (d.start.length === 10) {
    const s = Date.parse(d.start + 'T00:00:00+09:00')
    const e = Date.parse((d.end ?? d.start) + 'T00:00:00+09:00') + DAY
    return [s, e]
  }
  const s = Date.parse(d.start)
  let e = d.end ? Date.parse(d.end.length === 10 ? d.end + 'T23:59:00+09:00' : d.end) : s
  if (!(e > s)) e = s + HOUR
  return [s, e]
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data: token } = await db.rpc('get_notion_sync_token')
  if (!token || req.headers.get('x-sync-token') !== token) return json({ error: 'unauthorized' }, 401)
  const NT = Deno.env.get('NOTION_TOKEN')
  if (!NT) return json({ error: 'NOTION_TOKEN 이 없습니다' }, 500)

  // 동시에 두 번 돌지 않게 (90초 자물쇠)
  const nowIso = new Date().toISOString()
  const { data: lock } = await db.from('notion_sync_meta').update({ running_until: new Date(Date.now() + 90_000).toISOString() })
    .eq('id', 1).or(`running_until.is.null,running_until.lt.${nowIso}`).select('id')
  if (!lock?.length) return json({ busy: true })

  const H = { Authorization: `Bearer ${NT}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }
  const notion = async (path: string, method = 'GET', body?: unknown) => {
    for (let i = 0; i < 4; i++) {
      const r = await fetch(`https://api.notion.com/v1/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
      if (r.status === 429) { await sleep(1000 * (i + 1)); continue }
      const j = await r.json()
      if (!r.ok) throw new Error(`노션 ${r.status}: ${j.message ?? ''}`)
      return j
    }
    throw new Error('노션 요청이 너무 많습니다')
  }
  // 관리용: { unlink_archive: [페이지 id] } → 그 노션 페이지를 보관하고 대시보드 연결을 끊는다 (잘못 만든 중복 정리)
  const body = await req.json().catch(() => ({}))
  if (Array.isArray(body.unlink_archive)) {
    const done: string[] = []
    for (const id of body.unlink_archive) {
      try { await notion(`pages/${id}`, 'PATCH', { archived: true }) } catch { /* 이미 없음 */ }
      await db.from('vehicle_bookings').update({ notion_page_id: null, notion_edited_at: null, notion_synced_at: new Date().toISOString() }).eq('notion_page_id', id)
      done.push(id)
    }
    await db.from('notion_sync_meta').update({ running_until: null }).eq('id', 1)
    return json({ archived: done })
  }
  const issues: { notion_page_id: string | null; message: string }[] = []
  const stats = { pulled: 0, pushed: 0, created: 0, deleted: 0, linked: 0 }

  try {
    const windowStart = Date.now() - DAY
    // 1. 노션 신청 읽기 (어제 이후 날짜)
    const pages: any[] = []
    let cursor: string | undefined
    do {
      const q = await notion(`databases/${DB_ID}/query`, 'POST', {
        page_size: 100, start_cursor: cursor,
        filter: { property: P.when, date: { on_or_after: new Date(windowStart + KST).toISOString().slice(0, 10) } },
      })
      pages.push(...q.results); cursor = q.has_more ? q.next_cursor : undefined
    } while (cursor)
    const pageById = new Map(pages.map((p) => [p.id.replace(/-/g, ''), p]))

    // 2. 대시보드 쪽
    const [{ data: vehicles }, { data: depts }, { data: tomb }] = await Promise.all([
      db.from('vehicles').select('id, name, notion_name'),
      db.from('departments').select('id, name'),
      db.from('notion_booking_deletions').select('*'),
    ])
    const { data: allB } = await db.from('vehicle_bookings').select('*')
    const bookings: Booking[] = ((allB ?? []) as Booking[])
      .filter((b) => span(b.during)[1] >= windowStart || (b.notion_page_id && pageById.has(b.notion_page_id)))
    // 노션 차량 이름(notion_name)이 없으면 대시보드 차량 이름으로 짝짓는다 (새로 등록한 차량)
    const vehicleByNotion = new Map([...(vehicles ?? []).map((v) => [v.name, v]), ...(vehicles ?? []).filter((v) => v.notion_name).map((v) => [v.notion_name, v])] as [string, any][])
    const vehicleById = new Map((vehicles ?? []).map((v) => [v.id, v]))
    const deptName = (id: string | null) => (depts ?? []).find((d) => d.id === id)?.name ?? null
    const groupOf = (pid: string) => bookings.filter((b) => b.notion_page_id === pid)
    const changedLocally = (b: Booking) => !b.notion_synced_at || Date.parse(b.updated_at) > Date.parse(b.notion_synced_at) + 1000
    const carName = (vid: number) => vehicleById.get(vid)?.notion_name ?? vehicleById.get(vid)?.name ?? '차량'
    const props = (b: Booking, vids: number[]) => {
      const [s, e] = span(b.during)
      return {
        [P.title]: { title: rich(b.requester || '대시보드 신청') },
        [P.cars]: { multi_select: [...new Set(vids)].map((v) => ({ name: carName(v) })) },
        [P.when]: { date: { start: kst(s), end: kst(e) } },
        [P.driver]: { rich_text: rich(b.driver) },
        [P.dept]: { rich_text: rich(b.dept_text || deptName(b.dept_id)) },
      }
    }
    const mark = async (ids: number[], edited: string, extra: Record<string, unknown> = {}) => {
      const t = new Date().toISOString()
      if (ids.length) await db.from('vehicle_bookings').update({ notion_edited_at: edited, notion_synced_at: t, updated_at: t, ...extra }).in('id', ids)
    }
    const handled = new Set<string>()

    // 3. 대시보드에서 지운 예약
    for (const pid of [...new Set((tomb ?? []).map((t) => t.notion_page_id))]) {
      const left = groupOf(pid)
      try {
        if (!pageById.has(pid)) { /* 이미 노션에서 없음 */ }
        else if (!left.length) { await notion(`pages/${pid}`, 'PATCH', { archived: true }); stats.deleted++ }
        else {
          const r = await notion(`pages/${pid}`, 'PATCH', { properties: { [P.cars]: { multi_select: left.map((b) => ({ name: carName(b.vehicle_id) })) } } })
          await mark(left.map((b) => b.id), r.last_edited_time); stats.pushed++
        }
        handled.add(pid)
        await db.from('notion_booking_deletions').delete().eq('notion_page_id', pid)
      } catch (e) { issues.push({ notion_page_id: pid, message: `노션에서 지우지 못함: ${(e as Error).message}` }) }
      await sleep(350)
    }

    // 노션 → 대시보드 반영
    async function pull(p: any, group: Booking[]) {
      const pid = p.id.replace(/-/g, '')
      const pr = p.properties
      const sp = pageSpan(pr[P.when]?.date)
      const who = text(pr[P.title]?.title) || null
      if (!sp) { issues.push({ notion_page_id: pid, message: `${who ?? '이름 없음'}: 날짜가 없어 가져오지 못함` }); return }
      const names: string[] = (pr[P.cars]?.multi_select ?? []).map((o: any) => o.name)
      const vids: number[] = []
      for (const n of names) {
        const v = vehicleByNotion.get(n)
        if (v) vids.push(v.id); else issues.push({ notion_page_id: pid, message: `${who ?? ''}: 대시보드에 없는 차량 "${n}"` })
      }
      const fields = { during: range(sp[0], sp[1]), requester: who, driver: text(pr[P.driver]?.rich_text) || null, dept_text: text(pr[P.dept]?.rich_text) || null, dept_id: null }
      const t = new Date().toISOString()
      const sync = { notion_page_id: pid, notion_edited_at: p.last_edited_time, notion_synced_at: t, updated_at: t }
      for (const vid of vids) {
        let b = group.find((x) => x.vehicle_id === vid)
        if (!b) {
          // 처음 연결: 같은 차량·같은 시간의 연결 안 된 대시보드 예약이 있으면 짝짓기
          b = bookings.find((x) => !x.notion_page_id && x.vehicle_id === vid && span(x.during)[0] === sp[0] && span(x.during)[1] === sp[1])
          if (b) { b.notion_page_id = pid; stats.linked++ }
        }
        const res = b
          ? await db.from('vehicle_bookings').update({ ...fields, ...sync }).eq('id', b.id)
          : await db.from('vehicle_bookings').insert({ ...fields, ...sync, vehicle_id: vid, created_by: null })
        if (res.error) {
          issues.push({ notion_page_id: pid, message: res.error.code === '23P01'
            ? `${who ?? ''} · ${carName(vid)} · ${kst(sp[0]).slice(5, 16).replace('T', ' ')}: 대시보드의 다른 예약과 시간이 겹쳐 가져오지 못함`
            : `${who ?? ''}: ${res.error.message}` })
        } else stats.pulled++
      }
      const drop = group.filter((b) => !vids.includes(b.vehicle_id))
      if (drop.length) await db.from('vehicle_bookings').delete().in('id', drop.map((b) => b.id))
    }

    // 4. 노션 신청마다 비교
    for (const p of pages) {
      const pid = p.id.replace(/-/g, '')
      if (handled.has(pid)) continue
      const group = groupOf(pid)
      const notionChanged = !group.length || group.some((b) => b.notion_edited_at !== p.last_edited_time && Date.parse(b.notion_edited_at ?? '0') !== Date.parse(p.last_edited_time))
      const changed = group.filter(changedLocally)
      try {
        if (notionChanged) { await pull(p, group); continue }
        if (!changed.length) continue
        const base = changed[0]
        const [s0, e0] = span(base.during)
        const same = (b: Booking) => { const [s, e] = span(b.during); return s === s0 && e === e0 }
        const stay = group.filter((b) => !changed.includes(b) && !same(b))
        const move = group.filter((b) => !stay.includes(b))
        const r = await notion(`pages/${pid}`, 'PATCH', { properties: props(base, move.map((b) => b.vehicle_id)) })
        await mark(move.map((b) => b.id), r.last_edited_time, { requester: base.requester, driver: base.driver, dept_text: base.dept_text, dept_id: base.dept_id })
        stats.pushed++
        if (stay.length) {
          // 시간이 달라진 차량은 떼어 내 남은 차량끼리 새 신청으로
          const n = await notion('pages', 'POST', { parent: { database_id: DB_ID }, properties: props(stay[0], stay.map((b) => b.vehicle_id)) })
          await mark(stay.map((b) => b.id), n.last_edited_time, { notion_page_id: n.id.replace(/-/g, '') })
          stats.created++
        }
      } catch (e) { issues.push({ notion_page_id: pid, message: `노션과 맞추지 못함: ${(e as Error).message}` }) }
      await sleep(350)
    }

    // 5. 노션에서 사라진 신청 → 대시보드에서도 지우기
    const gone = bookings.filter((b) => b.notion_page_id && !pageById.has(b.notion_page_id) && span(b.during)[0] >= Date.now() && !(tomb ?? []).some((t) => t.notion_page_id === b.notion_page_id))
    for (const b of gone) {
      try {
        const p = await notion(`pages/${b.notion_page_id}`)
        if (!p.archived && !p.in_trash) continue // 날짜가 범위 밖으로 옮겨진 것뿐
      } catch { /* 찾을 수 없음 = 지워짐 */ }
      await db.from('vehicle_bookings').delete().eq('id', b.id); stats.deleted++
      await sleep(350)
    }

    // 6. 대시보드에만 있는 예약 → 노션에 새 신청
    const fresh = (await db.from('vehicle_bookings').select('*').is('notion_page_id', null)).data as Booking[] ?? []
    // 이미 시작된 예약은 노션 검색 범위 밖일 수 있어 새로 만들지 않는다 (중복 방지)
    for (const b of fresh.filter((x) => span(x.during)[0] >= windowStart)) {
      try {
        const n = await notion('pages', 'POST', { parent: { database_id: DB_ID }, properties: props(b, [b.vehicle_id]) })
        await mark([b.id], n.last_edited_time, { notion_page_id: n.id.replace(/-/g, '') })
        stats.created++
      } catch (e) { issues.push({ notion_page_id: null, message: `${b.requester ?? ''} 예약을 노션에 넣지 못함: ${(e as Error).message}` }) }
      await sleep(350)
    }

    if (issues.length) {
      // 같은 문제는 한 번만 남긴다
      const { data: old } = await db.from('notion_sync_issues').select('message')
      const seen = new Set((old ?? []).map((o) => o.message))
      const add = issues.filter((i) => !seen.has(i.message))
      if (add.length) await db.from('notion_sync_issues').insert(add)
    }
    await db.from('notion_sync_meta').update({ running_until: null, last_run: new Date().toISOString(), last_error: null }).eq('id', 1)
    return json({ ok: true, notion_pages: pages.length, ...stats, issues: issues.length })
  } catch (e) {
    await db.from('notion_sync_meta').update({ running_until: null, last_run: new Date().toISOString(), last_error: (e as Error).message }).eq('id', 1)
    return json({ error: (e as Error).message }, 500)
  }
})
