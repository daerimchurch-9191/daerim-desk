// 홈 위젯 맞춤 설정 (2026-11-28)
// 사람마다 홈에 보일 위젯·순서·넓이(반 칸 / 한 줄)를 정한다. 계정에 저장(home_layouts)해서 컴퓨터·휴대폰이 같이 쓴다.
// 저장한 적 없으면 지금까지의 기본 배치: 컴퓨터는 모두 같고, 휴대폰은 직분별(roleOf) 순서.
// 정렬: 컴퓨터 홈은 두 칸 판. 한 줄 위젯은 한 줄을 다 쓰고, 반 칸 위젯은 두 개씩 나란히.
// 반 칸 위젯이 혼자 남으면(짝이 없으면) 빈칸이 생기지 않게 한 줄로 늘어난다. 휴대폰은 모두 한 줄.
import { useEffect, useState } from 'react'
import { supabase, useAuth, visitRooms } from './auth.jsx'
import { useData, Modal, WeekCalendar, CarsWeek, TodayCard } from './live.jsx'
import { MySermons, SermonTable } from './sermons.jsx'
import { Todos } from './personal.jsx'
import { NoticeStrip } from './notices.jsx'
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
  { id: 'notice', name: '공지 띠', hint: '안 읽은 공지가 있을 때만 보여요', half: false, render: ({ notices }) => <NoticeStrip notices={notices} always /> },
  { id: 'sermons_mine', name: '내 설교', half: true, render: () => <MySermons /> },
  { id: 'todos', name: '할 일', half: true, render: () => <Todos /> },
  { id: 'today', name: '오늘', hint: '오늘 일정', half: true, render: () => <TodayCard /> },
  { id: 'week', name: '주간 캘린더', half: false, render: () => <WeekCalendar /> },
  { id: 'sermon_table', name: '예배 설교표', half: false, render: () => <SermonTable /> },
  { id: 'cars', name: '차량 현황', hint: '이번 주', half: false, render: () => <CarsWeek /> },
  { id: 'visits', name: '심방보고 방', half: true, allow: ({ canVisit }) => canVisit, render: () => <VisitRoomsCard /> },
  { id: 'devotions', name: '아침경건회', hint: '이번 주 순서', half: true, render: () => <DevotionCard /> },
  { id: 'attendance', name: '출석', hint: '지난 주일 인원', half: true, render: () => <AttendanceCard /> },
]
const BY_ID = Object.fromEntries(WIDGETS.map((w) => [w.id, w]))

// 휴대폰 홈 기본 순서: 직분 '목사' → 목사님, 교구 소속 → 교구(심방) 전도사님, 그 외 → 교육부
export function roleOf(profile, departments) {
  if ((profile.title ?? '').includes('목사')) return 'pastor'
  const grps = (profile.dept_ids ?? []).map((id) => departments.find((d) => d.id === id)?.grp)
  return grps.includes('parish') ? 'parish' : 'edu'
}
const PHONE_ON = {
  pastor: ['sermons_mine', 'todos', 'today', 'visits'],
  parish: ['todos', 'today', 'visits'],
  edu: ['todos', 'today', 'sermons_mine'],
}
const DESK_ON = ['notice', 'sermons_mine', 'todos', 'week', 'sermon_table', 'cars']
const HALF_DEFAULT = ['sermons_mine', 'todos']

// 기본 배치: 켜진 것을 그 순서대로 앞에, 나머지는 꺼진 채 뒤에
function defaultLayout(phone, role) {
  const on = phone ? PHONE_ON[role] : DESK_ON
  const rest = WIDGETS.map((w) => w.id).filter((id) => !on.includes(id))
  return [...on, ...rest].map((id) => ({ id, on: on.includes(id), w: HALF_DEFAULT.includes(id) ? 'half' : 'full' }))
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

// 켜진 위젯에 넓이 정하기: 반 칸은 다음 위젯도 반 칸일 때만 짝지어 나란히, 아니면 한 줄
function placeAll(items, phone) {
  const out = []
  for (let i = 0; i < items.length; i++) {
    const a = items[i], b = items[i + 1]
    if (!phone && a.w === 'half' && b?.w === 'half') { out.push({ ...a, span: 1 }, { ...b, span: 1 }); i++ }
    else out.push({ ...a, span: 2 })
  }
  return out
}

/* ---------- 홈 편집 창 ---------- */
function HomeEditModal({ start, phone, onSave, onReset, onClose }) {
  const [list, setList] = useState(start)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (i, patch) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const move = (i, d) => setList((l) => {
    const j = i + d
    if (j < 0 || j >= l.length) return l
    const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n
  })
  const run = async (fn) => {
    setBusy(true); setError('')
    const err = await fn()
    setBusy(false)
    if (err) setError('저장하지 못했어요. 잠시 뒤 다시 해 주세요.'); else onClose()
  }
  return (
    <Modal title="홈 편집" onClose={onClose} onSubmit={(e) => { e.preventDefault(); run(() => onSave(list)) }}
      footer={<>
        <button type="button" className="btn" disabled={busy} onClick={() => run(onReset)}>기본으로 되돌리기</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </>}>
      <p className="muted small">켜고 끄기, ↑↓로 순서를 바꿔요. 컴퓨터와 휴대폰에 같이 쓰여요.{phone ? ' 휴대폰에서는 반 칸도 한 줄로 보여요.' : ' 반 칸 위젯은 다음 위젯도 반 칸이면 나란히 놓여요.'}</p>
      <ul className="he-list">
        {list.map((x, i) => {
          const w = BY_ID[x.id]
          return (
            <li key={x.id} className={`he-row${x.on ? '' : ' is-off'}`}>
              <label className="he-name">
                <input type="checkbox" checked={x.on} onChange={(e) => set(i, { on: e.target.checked })} />
                <span><b>{w.name}</b>{w.hint && <small>{w.hint}</small>}</span>
              </label>
              {w.half ? (
                <span className="hc-seg he-size" role="group" aria-label={`${w.name} 넓이`}>
                  {[['half', '반 칸'], ['full', '한 줄']].map(([v, t]) => (
                    <button key={v} type="button" className={x.w === v ? 'is-on' : ''} aria-pressed={x.w === v} onClick={() => set(i, { w: v })}>{t}</button>
                  ))}
                </span>
              ) : <span className="he-size he-fixed">한 줄</span>}
              <span className="he-move">
                <button type="button" aria-label={`${w.name} 위로`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" aria-label={`${w.name} 아래로`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
              </span>
            </li>
          )
        })}
      </ul>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

/* ---------- 홈 ---------- */
export function HomeWidgets({ phone, notices }) {
  const { profile } = useAuth()
  const { departments, openModal, notify } = useData()
  const [saved, keep] = useSavedLayout()
  const ctx = { notices, canVisit: visitRooms(profile, departments).length > 0 }
  if (saved === undefined) return <div className="home-v2"><span className="skeleton" /></div>

  const layout = saved ? normalize(saved) : defaultLayout(phone, roleOf(profile, departments))
  // 권한이 없는 위젯은 화면에도 편집 목록에도 보이지 않는다 (저장된 값은 남겨 둠)
  const allowed = (x) => !BY_ID[x.id].allow || BY_ID[x.id].allow(ctx)
  const shown = placeAll(layout.filter((x) => x.on && allowed(x)), phone)

  const save = async (list) => {
    // 권한 없어 목록에 안 보인 위젯은 원래 자리 그대로 뒤에 붙여 둔다
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
        {shown.map((x) => <div key={x.id} className={`hw${x.span === 2 ? ' is-full' : ''}`}>{BY_ID[x.id].render(ctx)}</div>)}
      </div>
      {shown.length === 0 && <div className="empty">홈에 켜 둔 위젯이 없어요. 아래 "홈 편집"에서 켜 보세요.</div>}
      <button type="button" className="home-edit" onClick={edit}>홈 편집 · 위젯 켜기·순서·넓이</button>
    </div>
  )
}
