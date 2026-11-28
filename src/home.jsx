// 홈 위쪽 오른편: 검색 · 알림 목록
// 둘 다 화면에서 거르지 않고 데이터베이스 규칙(RLS)이 허락한 것만 받아 온다.
// 그래서 권한 없는 심방보고·남의 연차·남의 개인 일정은 처음부터 오지 않는다.
import { useEffect, useRef, useState } from 'react'
import { supabase, useAuth } from './auth.jsx'
import { useData, DOW_KO, parseRange, useParishFilter } from './live.jsx'
import { useOpenSermon, SERVICES } from './sermons.jsx'
import { TodoModal } from './personal.jsx'
import { useNoticeActions } from './notices.jsx'

const shortDate = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} (${DOW_KO[d.getDay()]})` }
const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  if (m < 60 * 24) return `${Math.round(m / 60)}시간 전`
  return `${Math.round(m / 1440)}일 전`
}

// 바깥을 누르거나 Esc 를 누르면 닫는다
function useDismiss(ref, open, close) {
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) close() }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
}

/* ---------- 검색 ---------- */
function SearchBox({ notices, autoFocus, onDone }) {
  const { profile } = useAuth()
  const { staff, departments, openModal } = useData()
  const openSermon = useOpenSermon()
  const { view } = useNoticeActions(notices)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [res, setRes] = useState(null)
  const box = useRef(null)
  const input = useRef(null)
  useDismiss(box, open, () => setOpen(false))

  // Ctrl+K (맥은 ⌘K) 로 검색칸으로
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); setOpen(true) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    // 쉼표·괄호는 검색 조건 문법과 겹치므로 뺀다
    const word = q.trim().replace(/[,()%*\\]/g, ' ').trim()
    if (word.length < 1) { setRes(null); return }
    let alive = true
    const t = setTimeout(async () => {
      const like = `%${word}%`
      const ids = staff.filter((p) => p.name.includes(word)).map((p) => p.id)
      const [ev, se, ad, td, vi] = await Promise.all([
        supabase.from('events').select('*').or(`title.ilike.${like},location.ilike.${like},note.ilike.${like}`).order('starts_at', { ascending: false }).limit(6),
        supabase.from('sermons').select('*').or([`title.ilike.${like}`, `passage.ilike.${like}`, `preacher_name.ilike.${like}`, ids.length ? `preacher_id.in.(${ids.join(',')})` : null].filter(Boolean).join(',')).order('date', { ascending: false }).limit(6),
        supabase.from('bulletin_ads').select('*').or(`title.ilike.${like},body.ilike.${like},dept.ilike.${like}`).order('week_of', { ascending: false }).limit(5),
        supabase.from('todos').select('*').ilike('text', like).limit(5),
        supabase.from('visit_messages').select('id, dept_id, target, created_at').or(`body.ilike.${like},target.ilike.${like}`).order('created_at', { ascending: false }).limit(5),
      ])
      if (!alive) return
      const nt = (notices.list ?? []).filter((n) => `${n.title} ${n.body ?? ''}`.includes(word)).slice(0, 5)
      setRes({ ev: ev.data ?? [], se: se.data ?? [], ad: ad.data ?? [], td: td.data ?? [], vi: vi.data ?? [], nt })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [q, staff, notices.list])

  const go = (fn) => () => { setOpen(false); onDone?.(); fn() }
  const preacher = (s) => (s.preacher_id ? staff.find((p) => p.id === s.preacher_id)?.name : s.preacher_name) || '설교자 미정'
  const groups = res && [
    ['일정', res.ev.map((e) => ({ key: `e${e.id}`, title: e.title, sub: shortDate(e.starts_at), on: go(() => openModal({ type: 'event', initial: e })) }))],
    ['설교', res.se.map((s) => ({ key: `s${s.id}`, title: `${s.title || SERVICES[s.service]?.name} · ${s.passage || '본문 미정'}`, sub: `${shortDate(`${s.date}T00:00`)} · ${preacher(s)}`, on: go(() => openSermon(s)) }))],
    ['공지', res.nt.map((n) => ({ key: `n${n.id}`, title: n.title, sub: shortDate(n.created_at), on: go(() => view(n)) }))],
    ['주보 광고', res.ad.map((a) => ({ key: `a${a.id}`, title: a.title, sub: `${shortDate(`${a.week_of}T00:00`)} 주보${a.dept ? ` · ${a.dept}` : ''}`, on: go(() => { location.hash = '#ads' }) }))],
    ['할 일', res.td.map((t) => ({ key: `t${t.id}`, title: t.text, sub: t.done ? '끝냄' : '나만 보기', on: go(() => openModal({ render: (close) => <TodoModal initial={t} onClose={close} /> })) }))],
    ['심방보고', res.vi.map((v) => ({ key: `v${v.id}`, title: v.target || '심방 기록', sub: `${departments.find((d) => d.id === v.dept_id)?.name ?? ''} · ${shortDate(v.created_at)}`, on: go(() => { location.hash = '#visits' }) }))],
  ].filter(([, list]) => list.length)

  return (
    <div className="hs" ref={box}>
      <label className="hs-box">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2 17 17" /></svg>
        <input ref={input} type="search" value={q} autoFocus={autoFocus} placeholder="일정·설교·공지·광고 검색" aria-label="검색"
          onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} />
        {!q && <kbd>Ctrl K</kbd>}
      </label>
      {open && q.trim() && (
        <div className="hs-pop" role="listbox" aria-label="검색 결과">
          {res === null && <span className="skeleton" />}
          {res && groups.length === 0 && <p className="hs-empty">'{q.trim()}'에 맞는 결과가 없습니다.</p>}
          {groups?.map(([name, list]) => (
            <div key={name} className="hs-group">
              <span className="hs-label">{name}</span>
              {list.map((it) => (
                <button key={it.key} type="button" className="hs-item" onClick={it.on}><b>{it.title}</b><span>{it.sub}</span></button>
              ))}
            </div>
          ))}
          {res && !profile.perms?.some((p) => p.startsWith('visit')) && <p className="hs-note">심방보고는 권한이 있는 교구만 검색됩니다.</p>}
        </div>
      )}
    </div>
  )
}

/* ---------- 알림 목록 ---------- */
const DAYS = 14
function useFeed() {
  const { profile } = useAuth()
  const { staff, departments, vehicles, version } = useData()
  const parishFilter = useParishFilter()
  const [items, setItems] = useState(null)
  const [tick, setTick] = useState(0)
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 5 * 60000); return () => clearInterval(t) }, [])
  useEffect(() => {
    const since = new Date(Date.now() - DAYS * 864e5).toISOString()
    const who = (id) => staff.find((p) => p.id === id)?.name ?? ''
    const dept = (id) => departments.find((d) => d.id === id)?.name ?? ''
    const notMine = (r) => r.created_by !== profile.id
    Promise.all([
      supabase.from('notices').select('id, title, created_at, created_by').gte('created_at', since),
      supabase.from('events').select('*').gte('created_at', since).neq('dept_id', 'personal'),
      supabase.from('vehicle_bookings').select('*').gte('created_at', since),
      supabase.from('bulletin_ads').select('id, title, dept, created_at, created_by').gte('created_at', since),
      supabase.from('visit_messages').select('id, dept_id, created_at, created_by').gte('created_at', since),
      supabase.from('leave_requests').select('*').or(`created_at.gte.${since},decided_at.gte.${since}`),
    ]).then(([nt, ev, cb, ad, vi, lv]) => {
      const list = []
      ;(nt.data ?? []).filter(notMine).forEach((n) => list.push({ key: `n${n.id}`, kind: '공지', at: n.created_at, title: n.title, row: n }))
      ;(parishFilter(ev.data) ?? []).filter(notMine).forEach((e) => list.push({ key: `e${e.id}`, kind: '일정', at: e.created_at, title: e.title, sub: `${dept(e.dept_id)} · ${shortDate(e.starts_at)}`, row: e }))
      ;(cb.data ?? []).filter(notMine).forEach((b) => list.push({ key: `c${b.id}`, kind: '차량', at: b.created_at, title: `${vehicles.find((v) => v.id === b.vehicle_id)?.name ?? '차량'} 신청`, sub: `${b.dept_text || dept(b.dept_id)} · ${shortDate(parseRange(b.during)[0])}`, row: b }))
      ;(ad.data ?? []).filter(notMine).forEach((a) => list.push({ key: `a${a.id}`, kind: '주보 광고', at: a.created_at, title: a.title, sub: a.dept || '' }))
      // 심방은 내용을 보여주지 않는다 (성도 개인정보)
      ;(vi.data ?? []).filter(notMine).forEach((v) => list.push({ key: `v${v.id}`, kind: '심방보고', at: v.created_at, title: `${dept(v.dept_id)} 심방방에 새 글`, sub: who(v.created_by) }))
      ;(lv.data ?? []).forEach((r) => {
        if (r.profile_id !== profile.id && r.created_at >= since) list.push({ key: `l${r.id}`, kind: '연차', at: r.created_at, title: `${who(r.profile_id)} 연차 신청`, sub: `${r.start_date.slice(5).replace('-', '/')} · ${r.days}일`, hash: '#leave/admin' })
        if (r.profile_id === profile.id && r.decided_at && r.decided_at >= since && r.decided_by !== profile.id && ['approved', 'rejected'].includes(r.status)) {
          list.push({ key: `d${r.id}`, kind: '연차', at: r.decided_at, title: `내 연차가 ${r.status === 'approved' ? '승인' : '반려'}되었습니다`, sub: `${r.start_date.slice(5).replace('-', '/')} · ${r.days}일`, hash: '#leave' })
        }
      })
      list.sort((a, b) => (a.at < b.at ? 1 : -1))
      setItems(list.slice(0, 40))
    })
  }, [profile.id, version, tick, staff.length, departments.length, vehicles.length])
  return items
}

function Bell({ notices }) {
  const { profile } = useAuth()
  const { openModal } = useData()
  const { view } = useNoticeActions(notices)
  const items = useFeed()
  const key = `bell-seen:${profile.id}`
  const [seen, setSeen] = useState(() => { try { return localStorage.getItem(key) || '' } catch { return '' } })
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useDismiss(box, open, () => setOpen(false))
  const unread = (items ?? []).filter((x) => x.at > seen).length

  const [shownSeen, setShownSeen] = useState(seen)
  function toggle() {
    if (!open) {
      // 열어 둔 동안은 새 글 표시를 그대로 보여 주고, 배지는 지운다
      setShownSeen(seen)
      const now = new Date().toISOString()
      try { localStorage.setItem(key, now) } catch { /* 저장 못 해도 괜찮음 */ }
      setSeen(now)
    }
    setOpen(!open)
  }

  function act(x) {
    setOpen(false)
    if (x.kind === '공지') return view(x.row)
    if (x.kind === '일정') return openModal({ type: 'event', initial: x.row })
    if (x.kind === '차량') { location.hash = '#cars'; return }
    if (x.kind === '주보 광고') { location.hash = '#ads'; return }
    if (x.kind === '심방보고') { location.hash = '#visits'; return }
    if (x.hash) location.hash = x.hash
  }

  return (
    <div className="hb" ref={box}>
      <button type="button" className="hb-btn" aria-label={`알림${unread ? ` ${unread}개 새로 옴` : ''}`} aria-expanded={open} onClick={toggle}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8a5 5 0 0 1 10 0c0 4 1.5 5.5 1.5 5.5h-13S5 12 5 8M8.3 16.5a1.8 1.8 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span className="hb-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="hb-pop">
          <div className="hb-head"><b>알림</b><span>최근 {DAYS}일 · 내가 볼 수 있는 것만</span></div>
          {items === null && <span className="skeleton" />}
          {items?.length === 0 && <p className="hs-empty">최근 {DAYS}일 동안 새로 올라온 것이 없습니다.</p>}
          <div className="hb-list">
            {(items ?? []).map((x) => (
              <button key={x.key} type="button" className={`hb-item${x.at > shownSeen ? ' is-new' : ''}`} onClick={() => act(x)}>
                <span className="hb-kind">{x.kind}</span>
                <span className="hb-text"><b>{x.title}</b>{x.sub && <span>{x.sub}</span>}</span>
                <span className="hb-ago">{ago(x.at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function HomeTools({ notices }) {
  return (
    <div className="home-tools">
      <SearchBox notices={notices} />
      <Bell notices={notices} />
    </div>
  )
}

// 휴대폰 위쪽 검정 바: 돋보기를 누르면 검색칸이 바 아래로 펼쳐진다
export function PhoneTools({ notices }) {
  const [searching, setSearching] = useState(false)
  return (
    <>
      <button type="button" className="icon-btn" aria-label="검색" aria-expanded={searching} onClick={() => setSearching(!searching)}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2 17 17" /></svg>
      </button>
      <Bell notices={notices} />
      {searching && (
        <div className="phone-search">
          <SearchBox notices={notices} autoFocus onDone={() => setSearching(false)} />
          <button type="button" className="phone-search-x" onClick={() => setSearching(false)}>닫기</button>
        </div>
      )}
    </>
  )
}
