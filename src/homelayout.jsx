// 홈 위젯 맞춤 설정 (2026-11-28)
// 사람마다 홈에 보일 위젯·순서·넓이(반 칸 / 한 줄)를 정한다. 계정에 저장(home_layouts)해서 컴퓨터·휴대폰이 같이 쓴다.
// 저장한 적 없으면 직분별(roleOf) 기본 배치(DEFAULTS, 컴퓨터·휴대폰 따로).
// 정렬: 컴퓨터 홈은 두 칸 판(CSS grid). 한 줄 위젯은 한 줄을 다 쓰고, 반 칸 위젯은 늘 반 칸.
// 반 칸 다음에 한 줄 위젯이 오면 반 칸 오른쪽은 비어 있다(사용자 결정 2026-11-28). 휴대폰은 모두 한 줄.
// 편집 창: 작은 홈 화면(≡ 손잡이로 끌어 순서 바꾸기, 반 칸/한 줄, 빼기) + 위젯 보관함(체크하면 작은 화면 맨 아래에 올라감).
import { useEffect, useRef, useState } from 'react'
import { supabase, useAuth, visitRooms } from './auth.jsx'
import { useData, WeekCalendar, CarsWeek, TodayCard } from './live.jsx'
import { MySermons, SermonTable } from './sermons.jsx'
import { Todos } from './personal.jsx'
import { DevotionCard } from './devotions.jsx'
import { AttendanceCard } from './attendance.jsx'

function VisitRoomsCard() {
  const { profile } = useAuth()
  const { departments } = useData()
  const rooms = visitRooms(profile, departments)
  if (!rooms.length) return null
  return (
    <section className="hc" aria-labelledby="vr-h">
      <div className="hc-head"><h2 id="vr-h" className="hc-title"><a href="#visits">심방보고</a></h2><span className="hc-right"><a href="#visits" className="hc-more">심방보고 →</a></span></div>
      <div className="vr-grid">
        {rooms.map((r) => <a key={r.id} href="#visits" className="vr-room"><b>{r.name}</b><span>방 들어가기</span></a>)}
      </div>
    </section>
  )
}

// 위젯 목록. half = 반 칸을 고를 수 있는가 (false면 늘 한 줄). allow = 권한이 있어야 보이는 위젯.
const WIDGETS = [
  { id: 'sermons_mine', name: '내 설교', half: true, render: () => <MySermons /> },
  { id: 'todos', name: '할 일', half: true, render: () => <Todos /> },
  { id: 'today', name: '오늘', hint: '오늘 일정', half: true, render: () => <TodayCard /> },
  { id: 'week', name: '주간 캘린더', half: false, tall: true, render: () => <WeekCalendar /> },
  { id: 'sermon_table', name: '예배 설교표', half: false, tall: true, render: () => <SermonTable /> },
  { id: 'cars', name: '차량 현황', hint: '이번 주', half: false, tall: true, render: () => <CarsWeek /> },
  { id: 'visits', name: '심방보고 방', half: true, allow: ({ canVisit }) => canVisit, render: () => <VisitRoomsCard /> },
  { id: 'devotions', name: '아침경건회', hint: '이번 주 순서', half: true, render: () => <DevotionCard /> },
  { id: 'attendance', name: '출석', hint: '지난 주일 인원', half: true, render: () => <AttendanceCard /> },
]
const BY_ID = Object.fromEntries(WIDGETS.map((w) => [w.id, w]))

// 기본 배치 직분: 직분 '목사' → pastor, 직원 → staff, 사모 → samo, 교구 소속 → parish(교구·심방 전도사), 그 외 → edu(교육부)
export function roleOf(profile, departments) {
  if ((profile.title ?? '').includes('목사')) return 'pastor'
  if (profile.rank === '직원') return 'staff'
  if (profile.rank === '사모') return 'samo'
  const grps = (profile.dept_ids ?? []).map((id) => departments.find((d) => d.id === id)?.grp)
  return grps.includes('parish') ? 'parish' : 'edu'
}
// 직분별 기본 배치 (2026-11-28 사용자 결정: 컴퓨터·휴대폰 모두 직분별, 직원·사모 따로). 'id:h' = 반 칸, 'id' = 한 줄
const DEFAULTS = {
  desk: {
    pastor: ['sermons_mine:h', 'todos:h', 'week', 'sermon_table', 'visits:h', 'attendance:h', 'cars'],
    parish: ['todos:h', 'today:h', 'week', 'visits:h', 'sermons_mine:h', 'cars'],
    edu: ['sermons_mine:h', 'todos:h', 'week', 'sermon_table', 'cars'],
    staff: ['todos:h', 'today:h', 'week', 'cars', 'sermon_table'],
    samo: ['today:h', 'todos:h', 'week', 'sermon_table'],
  },
  phone: {
    pastor: ['sermons_mine', 'todos', 'today', 'visits'],
    parish: ['todos', 'today', 'visits'],
    edu: ['todos', 'today', 'sermons_mine'],
    staff: ['todos', 'today', 'week', 'cars'],
    samo: ['today', 'todos', 'week', 'sermon_table'],
  },
}

// 기본 배치: 켜진 것을 그 순서대로 앞에, 나머지는 꺼진 채 뒤에
function defaultLayout(phone, role) {
  const on = DEFAULTS[phone ? 'phone' : 'desk'][role].map((t) => { const [id, h] = t.split(':'); return { id, on: true, w: h ? 'half' : 'full' } })
  const rest = WIDGETS.filter((w) => !on.some((x) => x.id === w.id)).map((w) => ({ id: w.id, on: false, w: 'full' }))
  return [...on, ...rest]
}
// 저장된 배치 정리: 없어진 위젯은 빼고, 새로 생긴 위젯은 꺼진 채 뒤에 붙인다
function normalize(saved) {
  const seen = new Set()
  const out = []
  for (const x of Array.isArray(saved) ? saved : []) {
    if (!BY_ID[x?.id] || seen.has(x.id)) continue
    seen.add(x.id)
    out.push({ id: x.id, on: Boolean(x.on), w: BY_ID[x.id].half && x.w === 'half' ? 'half' : 'full' })
  }
  for (const w of WIDGETS) if (!seen.has(w.id)) out.push({ id: w.id, on: false, w: 'full' })
  return out
}

// 계정에 저장된 배치. undefined = 불러오는 중, null = 저장한 적 없음(기본 배치)
// 다음에 열 때 바로 보이게 이 기기에도 한 벌 둔다(localStorage).
function useSavedLayout() {
  const { profile } = useAuth()
  const key = `home-layout:${profile.id}`
  const [saved, setSaved] = useState(() => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : undefined } catch { return undefined }
  })
  const keep = (v) => { setSaved(v); try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* 저장 못 해도 괜찮음 */ } }
  useEffect(() => {
    supabase.from('home_layouts').select('layout').eq('profile_id', profile.id).maybeSingle()
      .then(({ data, error }) => { if (!error) keep(data ? data.layout : null) })
  }, [profile.id])
  return [saved, keep]
}

/* ---------- 홈 편집 창 ---------- */
// 왼쪽(휴대폰은 위): 작은 홈 화면. 오른쪽(휴대폰은 아래): 위젯 보관함.
// 끌기는 ≡ 손잡이를 누른 채 움직이면, 손가락·마우스 아래 위젯 자리로 바로바로 옮겨진다(마우스·터치 모두 pointer 이벤트).
function HomeEditModal({ start, phone, onSave, onReset, onClose }) {
  const [list, setList] = useState(start) // 전체 위젯 [{id, on, w}] — 켜진 것의 순서가 홈 순서
  const [drag, setDrag] = useState(null) // 끌고 있는 위젯 id
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const board = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const on = list.filter((x) => x.on)
  const set = (id, patch) => setList((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  // 보관함에서 켜면 맨 아래로, 끄면 보관함으로
  const toggle = (id, v) => setList((l) => {
    const x = l.find((y) => y.id === id)
    const rest = l.filter((y) => y.id !== id)
    if (!v) return [...rest.filter((y) => y.on), { ...x, on: false }, ...rest.filter((y) => !y.on)]
    return [...rest.filter((y) => y.on), { ...x, on: true }, ...rest.filter((y) => !y.on)]
  })
  // 끌고 있는 위젯을 target 위젯 자리로
  const moveTo = (id, target) => setList((l) => {
    if (id === target) return l
    const ons = l.filter((x) => x.on)
    const from = ons.findIndex((x) => x.id === id), to = ons.findIndex((x) => x.id === target)
    if (from < 0 || to < 0) return l
    const n = [...ons]; const [x] = n.splice(from, 1); n.splice(to, 0, x)
    return [...n, ...l.filter((y) => !y.on)]
  })
  const nudge = (id, d) => { const i = on.findIndex((x) => x.id === id); const t = on[i + d]; if (t) moveTo(id, t.id) }

  const startDrag = (id) => (e) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDrag(id)
  }
  const moveDrag = (e) => {
    if (!drag) return
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-wid]')
    if (el && board.current?.contains(el)) moveTo(drag, el.dataset.wid)
  }
  const endDrag = () => setDrag(null)

  const run = async (fn) => {
    setBusy(true); setError('')
    const err = await fn()
    setBusy(false)
    if (err) setError('저장하지 못했어요. 잠시 뒤 다시 해 주세요.'); else onClose()
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog he-dialog" role="dialog" aria-modal="true" aria-label="홈 편집" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="pill">홈 편집</h2>
        <div className="he-body">
          <section className="he-preview" aria-label="내 홈 (작은 화면)">
            <h3 className="he-h">내 홈 <small>≡를 끌어 순서를 바꿔요</small></h3>
            <div ref={board} className={`he-board${phone ? ' is-phone' : ''}`} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
              {on.map((x, i) => {
                const w = BY_ID[x.id]
                const half = !phone && x.w === 'half'
                return (
                  <div key={x.id} data-wid={x.id} className={`he-tile${half ? '' : ' is-full'}${w.tall ? ' is-tall' : ''}${drag === x.id ? ' is-drag' : ''}`}>
                    <div className="he-tile-top">
                      <b>{w.name}</b>
                      <button type="button" className="he-x" aria-label={`${w.name} 빼기`} onClick={() => toggle(x.id, false)}>✕</button>
                    </div>
                    <div className="he-tile-bottom">
                      {w.half && !phone ? (
                        <span className="hc-seg he-size" role="group" aria-label={`${w.name} 넓이`}>
                          {[['half', '반 칸'], ['full', '한 줄']].map(([v, t]) => (
                            <button key={v} type="button" className={x.w === v ? 'is-on' : ''} aria-pressed={x.w === v} onClick={() => set(x.id, { w: v })}>{t}</button>
                          ))}
                        </span>
                      ) : <small className="muted">{w.half ? (x.w === 'half' ? '반 칸 (컴퓨터)' : '한 줄') : '한 줄'}</small>}
                      <button type="button" className="he-grip" aria-label={`${w.name} 끌어서 옮기기 (키보드: 위아래 화살표)`}
                        onPointerDown={startDrag(x.id)}
                        onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); nudge(x.id, -1) } if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); nudge(x.id, 1) } }}>
                        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7.5h12M4 12.5h12" /></svg>
                      </button>
                    </div>
                    <span className="sr-only">{i + 1}번째</span>
                  </div>
                )
              })}
              {on.length === 0 && <p className="he-empty">보관함에서 위젯을 체크해 올려 주세요.</p>}
            </div>
          </section>
          <section className="he-store" aria-label="위젯 보관함">
            <h3 className="he-h">위젯 보관함 <small>체크하면 홈에 올라가요</small></h3>
            <ul>
              {[...list].sort((a, b) => WIDGETS.indexOf(BY_ID[a.id]) - WIDGETS.indexOf(BY_ID[b.id])).map((x) => {
                const w = BY_ID[x.id]
                return (
                  <li key={x.id}>
                    <label className={`he-item${x.on ? ' is-on' : ''}`}>
                      <input type="checkbox" checked={x.on} onChange={(e) => toggle(x.id, e.target.checked)} />
                      <span><b>{w.name}</b>{w.hint && <small>{w.hint}</small>}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => run(onReset)}>기본으로 되돌리기</button>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>취소</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => onSave(list))}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  )
}

/* ---------- 홈 ---------- */
export function HomeWidgets({ phone }) {
  const { profile } = useAuth()
  const { departments, openModal, notify } = useData()
  const [saved, keep] = useSavedLayout()
  const ctx = { canVisit: visitRooms(profile, departments).length > 0 }
  if (saved === undefined) return <div className="home-v2"><span className="skeleton" /></div>

  const layout = saved ? normalize(saved) : defaultLayout(phone, roleOf(profile, departments))
  // 권한이 없는 위젯은 화면에도 편집 창에도 보이지 않는다 (저장된 값은 남겨 둠)
  const allowed = (x) => !BY_ID[x.id].allow || BY_ID[x.id].allow(ctx)
  const shown = layout.filter((x) => x.on && allowed(x))

  const save = async (list) => {
    const full = [...list, ...layout.filter((x) => !allowed(x))]
    const { error } = await supabase.from('home_layouts').upsert({ profile_id: profile.id, layout: full, updated_at: new Date().toISOString() })
    if (error) return error
    keep(full); notify('홈 배치를 저장했어요.')
  }
  const reset = async () => {
    const { error } = await supabase.from('home_layouts').delete().eq('profile_id', profile.id)
    if (error) return error
    keep(null); notify('기본 배치로 되돌렸어요.')
  }
  const edit = () => openModal({
    render: (close) => <HomeEditModal start={layout.filter(allowed)} phone={phone} onSave={save} onReset={reset} onClose={close} />,
  })

  return (
    <div className="home-v2">
      <div className="home-grid">
        {shown.map((x) => <div key={x.id} className={`hw${x.w === 'half' && BY_ID[x.id].half ? '' : ' is-full'}`}>{BY_ID[x.id].render(ctx)}</div>)}
      </div>
      {shown.length === 0 && <div className="empty">홈에 올린 위젯이 없어요. 아래 "홈 편집"에서 올려 보세요.</div>}
      <button type="button" className="home-edit" onClick={edit}>홈 편집 · 위젯 넣고 빼기·순서·넓이</button>
    </div>
  )
}
