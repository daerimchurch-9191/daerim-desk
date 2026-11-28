// 홈 위젯 맞춤 설정 (2026-11-28)
// 사람마다 홈에 보일 위젯·순서·넓이(반 칸 / 한 줄)를 정한다. 계정에 저장(home_layouts)하고, 컴퓨터와 휴대폰은 따로 저장한다.
// 저장한 적 없으면 직분별(roleOf) 기본 배치(DEFAULTS). 휴대폰 기본은 컴퓨터 기본과 같은 순서(모두 한 줄).
// 정렬: 컴퓨터 홈은 두 칸 판(CSS grid). 한 줄 위젯은 한 줄을 다 쓰고, 반 칸 위젯은 늘 반 칸.
// 반 칸 다음에 한 줄 위젯이 오면 반 칸 오른쪽은 비어 있다(사용자 결정). 휴대폰은 모두 한 줄.
// 편집 창: 작은 홈 화면(≡ 손잡이로 끌어 순서 바꾸기, 반 칸/한 줄, 빼기) + 위젯 보관함(체크하면 작은 화면 맨 아래에 올라감).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase, useAuth } from './auth.jsx'
import { useData, WeekCalendar, CarsWeek, TodayCard } from './live.jsx'
import { MySermons, SermonTable } from './sermons.jsx'
import { Todos } from './personal.jsx'
import { DevotionCard } from './devotions.jsx'

// 위젯 목록. half = 반 칸을 고를 수 있는가 (false면 늘 한 줄). tall = 편집 창에서 조금 높게
const WIDGETS = [
  { id: 'sermons_mine', name: '내 설교', half: true, render: () => <MySermons /> },
  { id: 'todos', name: '할 일', half: true, render: () => <Todos /> },
  { id: 'today', name: '오늘', hint: '오늘 일정', half: true, render: () => <TodayCard /> },
  { id: 'week', name: '주간 캘린더', half: false, tall: true, render: () => <WeekCalendar /> },
  { id: 'sermon_table', name: '예배 설교표', half: false, tall: true, render: () => <SermonTable /> },
  { id: 'cars', name: '차량 현황', hint: '이번 주', half: false, tall: true, render: () => <CarsWeek /> },
  { id: 'devotions', name: '아침경건회', hint: '이번 주 순서', half: true, render: () => <DevotionCard /> },
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
// 직분별 기본 배치 (2026-11-28 사용자 결정). 'id:h' = 반 칸, 'id' = 한 줄. 휴대폰도 이 순서(모두 한 줄).
const DEFAULTS = {
  pastor: ['sermons_mine:h', 'todos:h', 'week', 'sermon_table', 'cars'],
  parish: ['today:h', 'todos:h', 'week', 'cars'],
  edu: ['today:h', 'todos:h', 'week', 'sermon_table', 'cars'],
  staff: ['today:h', 'todos:h', 'week', 'cars'],
  samo: ['today:h', 'todos:h', 'week', 'sermon_table', 'cars'],
}

// 기본 배치: 켜진 것을 그 순서대로 앞에, 나머지는 꺼진 채 뒤에
function defaultLayout(role) {
  const on = DEFAULTS[role].map((t) => { const [id, h] = t.split(':'); return { id, on: true, w: h ? 'half' : 'full' } })
  const rest = WIDGETS.filter((w) => !on.some((x) => x.id === w.id)).map((w) => ({ id: w.id, on: false, w: w.half ? 'half' : 'full' }))
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
  for (const w of WIDGETS) if (!seen.has(w.id)) out.push({ id: w.id, on: false, w: w.half ? 'half' : 'full' })
  return out
}

// 계정에 저장된 이 기기 종류(컴퓨터/휴대폰)의 배치. undefined = 불러오는 중, null = 저장한 적 없음(기본 배치)
// 다음에 열 때 바로 보이게 이 기기에도 한 벌 둔다(localStorage).
function useSavedLayout(phone) {
  const { profile } = useAuth()
  const col = phone ? 'phone_layout' : 'layout'
  const key = `home-layout:${profile.id}:${phone ? 'phone' : 'desk'}`
  const read = () => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : undefined } catch { return undefined } }
  const [saved, setSaved] = useState(read)
  const keep = (v) => { setSaved(v); try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* 저장 못 해도 괜찮음 */ } }
  useEffect(() => {
    setSaved(read())
    supabase.from('home_layouts').select(col).eq('profile_id', profile.id).maybeSingle()
      .then(({ data, error }) => { if (!error) keep(data?.[col] ?? null) })
  }, [profile.id, col])
  return [saved, keep, col]
}

/* ---------- 홈 편집 창 ---------- */
// 끌기(사용자가 보낸 참고 영상처럼): ≡를 누른 채 움직이면 그 위젯이 손가락·마우스를 그대로 따라 떠다니고,
// 다른 위젯 위로 가면 순서가 바뀌면서 나머지 위젯들이 부드럽게 비켜난다(FLIP 애니메이션). 놓으면 제자리로 쏙 들어간다.
// 화면 위·아래 끝으로 끌면 저절로 스크롤된다. 마우스·터치 모두 pointer 이벤트, 키보드는 화살표.
function HomeEditModal({ start, phone, onSave, onReset, onClose }) {
  const [list, setList] = useState(start) // 전체 위젯 [{id, on, w}] — 켜진 것의 순서가 홈 순서
  const [drag, setDrag] = useState(null) // 끌고 있는 위젯 id
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const board = useRef(null)
  const dialog = useRef(null)
  const tiles = useRef({}) // id → 요소
  const g = useRef(null) // 끌기 상태: { id, gx, gy, px, py, last, scroller, raf }
  const flipFrom = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const on = list.filter((x) => x.on)
  const set = (id, patch) => setList((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  // 보관함에서 켜면 맨 아래로, 끄면 보관함으로
  const toggle = (id, v) => {
    flipFrom.current = snapshot()
    setList((l) => {
      const x = { ...l.find((y) => y.id === id), on: v }
      const rest = l.filter((y) => y.id !== id)
      return v ? [...rest.filter((y) => y.on), x, ...rest.filter((y) => !y.on)] : [...rest, x]
    })
  }

  // 위치가 바뀌기 전 자리를 적어 두고(First), 바뀐 뒤 그만큼 되돌렸다가 0으로 미끄러지게(Invert·Play)
  const snapshot = () => Object.fromEntries(Object.entries(tiles.current).filter(([, el]) => el).map(([id, el]) => [id, el.getBoundingClientRect()]))
  const moveTo = (id, target) => {
    flipFrom.current = snapshot()
    setList((l) => {
      const ons = l.filter((x) => x.on)
      const from = ons.findIndex((x) => x.id === id), to = ons.findIndex((x) => x.id === target)
      if (from < 0 || to < 0 || from === to) return l
      const n = [...ons]; const [x] = n.splice(from, 1); n.splice(to, 0, x)
      return [...n, ...l.filter((y) => !y.on)]
    })
  }
  const nudge = (id, d) => { const i = on.findIndex((x) => x.id === id); const t = on[i + d]; if (t) moveTo(id, t.id) }

  // 끌고 있는 위젯을 손가락 자리에 맞춰 그린다 (자기 칸에서 얼마나 떨어졌는지만큼 옮김)
  const follow = () => {
    const s = g.current
    const el = s && tiles.current[s.id]
    if (!el) return
    const b = board.current.getBoundingClientRect()
    const slotL = b.left + el.offsetLeft - board.current.scrollLeft, slotT = b.top + el.offsetTop - board.current.scrollTop
    // 작은 화면 밖으로 나가 잘리지 않게 판 안에 붙잡아 둔다. 한 칸 판(휴대폰)은 영상처럼 위아래로만 움직인다.
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
    const left = phone ? slotL : clamp(s.px - s.gx, b.left + 4, b.right - el.offsetWidth - 4)
    const top = clamp(s.py - s.gy, b.top + 4, Math.max(b.top + 4, b.bottom - el.offsetHeight - 4))
    const x = left - slotL, y = top - slotT
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.03)`
  }

  useLayoutEffect(() => {
    const before = flipFrom.current
    flipFrom.current = null
    if (before) {
      for (const [id, el] of Object.entries(tiles.current)) {
        if (!el || !before[id] || id === g.current?.id) continue
        const now = el.getBoundingClientRect()
        const dx = before[id].left - now.left, dy = before[id].top - now.top
        if (!dx && !dy) continue
        el.style.transition = 'none'
        el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
        el.getBoundingClientRect() // 되돌린 자리를 먼저 그리게
        el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)'
        el.style.transform = ''
      }
    }
    follow()
  }, [list])

  // 손가락 아래 다른 위젯이 있으면 그 자리로. 방금 자리를 바꾼 위젯 위에서는 손가락이 벗어날 때까지 다시 바꾸지 않는다(떨림 방지)
  const hitTest = () => {
    const s = g.current
    const hit = document.elementsFromPoint(s.px, s.py).map((n) => n.closest('[data-wid]')).find((n) => n && n.dataset.wid !== s.id)
    const id = hit && board.current.contains(hit) ? hit.dataset.wid : null
    if (id === s.last) return
    s.last = id
    if (id && id !== s.id) moveTo(s.id, id)
  }
  // 위·아래 끝 가까이에서 저절로 스크롤
  const autoScroll = () => {
    const s = g.current
    if (!s) return
    const sc = s.scroller
    const r = sc.getBoundingClientRect()
    const edge = 56
    const v = s.py < r.top + edge ? -Math.ceil((r.top + edge - s.py) / 6) : s.py > r.bottom - edge ? Math.ceil((s.py - r.bottom + edge) / 6) : 0
    if (v) { const t = sc.scrollTop; sc.scrollTop += v; if (sc.scrollTop !== t) { follow(); hitTest() } }
    s.raf = requestAnimationFrame(autoScroll)
  }

  const startDrag = (id) => (e) => {
    if (e.button > 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const el = tiles.current[id]
    const r = el.getBoundingClientRect()
    const bd = board.current
    const scroller = bd.scrollHeight > bd.clientHeight + 1 ? bd : dialog.current
    g.current = { id, gx: e.clientX - r.left, gy: e.clientY - r.top, px: e.clientX, py: e.clientY, last: id, scroller }
    el.style.transition = 'transform .12s ease'
    follow()
    el.getBoundingClientRect()
    el.style.transition = 'none'
    setDrag(id)
    g.current.raf = requestAnimationFrame(autoScroll)
  }
  const moveDrag = (e) => {
    const s = g.current
    if (!s) return
    s.px = e.clientX; s.py = e.clientY
    follow()
    hitTest()
  }
  const endDrag = () => {
    const s = g.current
    if (!s) return
    cancelAnimationFrame(s.raf)
    const el = tiles.current[s.id]
    g.current = null
    if (el) {
      el.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)'
      el.style.transform = ''
    }
    setDrag(null)
  }
  useEffect(() => () => { if (g.current) cancelAnimationFrame(g.current.raf) }, [])

  const run = async (fn) => {
    setBusy(true); setError('')
    const err = await fn()
    setBusy(false)
    if (err) setError('저장하지 못했어요. 잠시 뒤 다시 해 주세요.'); else onClose()
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div ref={dialog} className={`dialog he-dialog${drag ? ' is-dragging' : ''}`} role="dialog" aria-modal="true" aria-label="홈 편집" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="pill">{phone ? '홈 편집 · 휴대폰' : '홈 편집 · 컴퓨터'}</h2>
        <div className="he-body">
          <section className="he-preview" aria-label="내 홈 (작은 화면)">
            <h3 className="he-h">내 홈 <small>≡를 끌어 순서를 바꿔요</small></h3>
            <div ref={board} className={`he-board${phone ? ' is-phone' : ''}`} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
              {on.map((x, i) => {
                const w = BY_ID[x.id]
                const half = !phone && x.w === 'half'
                return (
                  <div key={x.id} ref={(n) => { tiles.current[x.id] = n }} data-wid={x.id}
                    className={`he-tile${half ? '' : ' is-full'}${w.tall ? ' is-tall' : ''}${drag === x.id ? ' is-drag' : ''}`}>
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
                      ) : <small className="muted">{phone ? '' : '한 줄'}</small>}
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
              {WIDGETS.map((w) => {
                const x = list.find((y) => y.id === w.id)
                return (
                  <li key={w.id}>
                    <label className={`he-item${x.on ? ' is-on' : ''}`}>
                      <input type="checkbox" checked={x.on} onChange={(e) => toggle(w.id, e.target.checked)} />
                      <span><b>{w.name}</b>{w.hint && <small>{w.hint}</small>}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
        <p className="muted small">{phone ? '휴대폰 홈 배치예요. 컴퓨터 배치는 컴퓨터에서 따로 정해요.' : '컴퓨터 홈 배치예요. 휴대폰 배치는 휴대폰에서 따로 정해요.'}</p>
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
  const [saved, keep, col] = useSavedLayout(phone)
  if (saved === undefined) return <div className="home-v2"><span className="skeleton" /></div>

  const layout = saved ? normalize(saved) : defaultLayout(roleOf(profile, departments))
  const shown = layout.filter((x) => x.on)

  // 이 기기 종류의 칸만 저장한다(다른 쪽 배치는 그대로)
  const save = async (list) => {
    const { error } = await supabase.from('home_layouts').upsert({ profile_id: profile.id, [col]: list, updated_at: new Date().toISOString() })
    if (error) return error
    keep(list); notify('홈 배치를 저장했어요.')
  }
  const reset = async () => {
    const { error } = await supabase.from('home_layouts').update({ [col]: null, updated_at: new Date().toISOString() }).eq('profile_id', profile.id)
    if (error) return error
    keep(null); notify('기본 배치로 되돌렸어요.')
  }
  const edit = () => openModal({
    render: (close) => <HomeEditModal start={layout} phone={phone} onSave={save} onReset={reset} onClose={close} />,
  })

  return (
    <div className="home-v2">
      <div className="home-grid">
        {shown.map((x) => <div key={x.id} className={`hw${!phone && x.w === 'half' && BY_ID[x.id].half ? '' : ' is-full'}`}>{BY_ID[x.id].render()}</div>)}
      </div>
      {shown.length === 0 && <div className="empty">홈에 올린 위젯이 없어요. 아래 "홈 편집"에서 올려 보세요.</div>}
      <button type="button" className="home-edit" onClick={edit}>홈 편집</button>
    </div>
  )
}
