// 실제 데이터(Supabase)와 연결된 부분: 교회 일정, 차량 예약
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, useAuth, toKorean } from './auth.jsx'

/* ---------- 날짜 ---------- */
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DOW_KO = ['일', '월', '화', '수', '목', '금', '토']
export const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const startOfWeek = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -x.getDay()) }
const sameDay = (a, b) => ymd(a) === ymd(b)
const local = (date, time) => new Date(`${date}T${time || '00:00'}`)
const range = (a, b) => `[${a.toISOString()},${b.toISOString()})`
const kDate = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW_KO[d.getDay()]})`

// '["2026-11-14 00:00:00+00","2026-11-14 06:00:00+00")' → [Date, Date]
function parseRange(r) {
  const m = r.match(/^[[(]"?([^",]+)"?,"?([^",\])]+)"?[\])]$/)
  const fix = (s) => new Date(s.trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'))
  return [fix(m[1]), fix(m[2])]
}

/* ---------- 공용 데이터 ---------- */
const DataContext = createContext(null)
export const useData = () => useContext(DataContext)

export function DataProvider({ children }) {
  const [departments, setDepartments] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [staff, setStaff] = useState([])
  const [version, setVersion] = useState(0)
  const [toast, setToast] = useState(null)
  const [modal, setModal] = useState(null) // { type: 'event' | 'car', initial }

  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  const notify = useCallback((text, ms = 2600) => {
    setToast(text)
    setTimeout(() => setToast((t) => (t === text ? null : t)), ms)
  }, [])

  useEffect(() => {
    supabase.from('departments').select('*').order('sort').then(({ data }) => setDepartments(data ?? []))
    supabase.from('vehicles').select('*').eq('active', true).order('sort').order('id').then(({ data }) => setVehicles(data ?? []))
    supabase.from('profiles').select('id, name, title').eq('status', 'approved').order('name').then(({ data }) => setStaff(data ?? []))
  }, [version])

  const value = { departments, vehicles, staff, version, refresh, notify, openModal: setModal }
  return (
    <DataContext.Provider value={value}>
      {children}
      {modal?.type === 'event' && <EventModal initial={modal.initial} onClose={() => setModal(null)} />}
      {modal?.render?.(() => setModal(null))}
      {modal?.type === 'car' && <CarModal initial={modal.initial} onClose={() => setModal(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </DataContext.Provider>
  )
}

const deptName = (departments, id) => departments.find((d) => d.id === id)?.name ?? ''
// 색은 부서 묶음(교회 전체·교육부·교구) 기준
const deptTag = (departments, id) => `tag-${departments.find((d) => d.id === id)?.grp ?? 'all'}`
export const GROUPS = [{ id: 'all', name: '교회 전체' }, { id: 'edu', name: '교육부' }, { id: 'parish', name: '교구' }]

export function DeptSelect({ value, onChange }) {
  const { departments } = useData()
  const of = (g) => departments.filter((d) => d.grp === g)
  return (
    <label className="field">부서
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {of('all').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        <optgroup label="교육부">{of('edu').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
        <optgroup label="교구">{of('parish').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
      </select>
    </label>
  )
}

/* ---------- 모달 틀 ---------- */
export function Modal({ title, onClose, onSubmit, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={onClose}>
      <form className="dialog" onSubmit={onSubmit} onMouseDown={(e) => e.stopPropagation()} aria-label={title}>
        <h2 className="pill">{title}</h2>
        {children}
        <div className="dialog-actions">{footer}</div>
      </form>
    </div>
  )
}

/* ---------- 일정 등록·수정 ---------- */
function EventModal({ initial, onClose }) {
  const { profile } = useAuth()
  const { refresh, notify } = useData()
  const editing = Boolean(initial?.id)
  const canEdit = !editing || initial.created_by === profile.id || profile.role === 'admin'
  const s = initial?.starts_at ? new Date(initial.starts_at) : null
  const e = initial?.ends_at ? new Date(initial.ends_at) : null
  const [f, setF] = useState({
    title: initial?.title ?? '',
    date: s ? ymd(s) : initial?.date ?? ymd(new Date()),
    start: s ? hm(s) : '10:00',
    end: e ? hm(e) : '',
    dept_id: initial?.dept_id ?? 'all',
    location: initial?.location ?? '',
    note: initial?.note ?? '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })

  async function save(ev) {
    ev.preventDefault()
    if (!f.title.trim()) return setError('일정 이름을 적어 주세요.')
    if (f.end && f.end <= f.start) return setError('끝나는 시간이 시작보다 늦어야 합니다.')
    const row = {
      title: f.title.trim(),
      starts_at: local(f.date, f.start).toISOString(),
      ends_at: f.end ? local(f.date, f.end).toISOString() : null,
      dept_id: f.dept_id,
      location: f.location.trim() || null,
      note: f.note.trim() || null,
    }
    setBusy(true)
    const res = editing
      ? await supabase.from('events').update(row).eq('id', initial.id)
      : await supabase.from('events').insert(row)
    setBusy(false)
    if (res.error) return setError(toKorean(res.error.message))
    refresh(); notify(editing ? '일정을 고쳤습니다.' : '일정을 등록했습니다.'); onClose()
  }

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('events').delete().eq('id', initial.id)
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    refresh(); notify('일정을 지웠습니다.'); onClose()
  }

  return (
    <Modal title={editing ? (canEdit ? '일정 수정' : '일정') : '일정 등록'} onClose={onClose} onSubmit={save}
      footer={canEdit ? (
        <>
          {editing && <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>삭제</button>}
          <button type="button" className="btn" onClick={onClose}>취소</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
        </>
      ) : <button type="button" className="btn btn-primary" onClick={onClose}>닫기</button>}>
      <fieldset className="plain" disabled={!canEdit}>
        <label className="field">일정 이름<input value={f.title} onChange={set('title')} placeholder="예: 유년부 야외활동" autoFocus={canEdit} /></label>
        <div className="field-row three">
          <label className="field">날짜<input type="date" value={f.date} onChange={set('date')} required /></label>
          <label className="field">시작<input type="time" value={f.start} onChange={set('start')} required /></label>
          <label className="field"><span>끝 <small>(선택)</small></span><input type="time" value={f.end} onChange={set('end')} /></label>
        </div>
        <DeptSelect value={f.dept_id} onChange={(v) => setF({ ...f, dept_id: v })} />
        <label className="field"><span>장소 <small>(선택)</small></span><input value={f.location} onChange={set('location')} /></label>
        <label className="field"><span>메모 <small>(선택)</small></span><input value={f.note} onChange={set('note')} /></label>
      </fieldset>
      {!canEdit && <p className="muted small">등록한 사람과 관리자만 고칠 수 있습니다.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

/* ---------- 차량 신청 ---------- */
function CarModal({ initial, onClose }) {
  const { departments, vehicles, refresh, notify } = useData()
  const editing = Boolean(initial?.id)
  const [f, setF] = useState(editing
    ? { date: ymd(initial.span[0]), from: hm(initial.span[0]), to: hm(initial.span[1]), vehicle_id: initial.vehicle_id, dept_id: initial.dept_id ?? 'all', driver: initial.driver ?? '', purpose: initial.purpose ?? '' }
    : { date: initial?.date ?? ymd(new Date()), from: '09:00', to: '12:00', vehicle_id: null, dept_id: 'all', driver: '', purpose: '' })
  const [dayBookings, setDayBookings] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })

  useEffect(() => {
    const a = local(f.date), b = addDays(a, 1)
    supabase.from('vehicle_bookings').select('*').overlaps('during', range(a, b))
      .then(({ data }) => setDayBookings((data ?? []).filter((x) => x.id !== initial?.id).map((x) => ({ ...x, span: parseRange(x.during) }))))
  }, [f.date])

  const valid = f.to > f.from
  const want = valid ? [local(f.date, f.from), local(f.date, f.to)] : null
  const clash = (vid) => want && dayBookings.find((b) => b.vehicle_id === vid && b.span[0] < want[1] && want[0] < b.span[1])
  useEffect(() => { if (f.vehicle_id && clash(f.vehicle_id)) setF((x) => ({ ...x, vehicle_id: null })) }, [f.from, f.to, dayBookings])

  async function save(ev) {
    ev.preventDefault()
    if (!valid) return setError('반납 시간이 출발보다 늦어야 합니다.')
    if (!f.vehicle_id) return setError('쓸 수 있는 차량을 골라 주세요.')
    setBusy(true)
    const row = {
      vehicle_id: f.vehicle_id, during: range(want[0], want[1]), dept_id: f.dept_id,
      driver: f.driver.trim() || null, purpose: f.purpose.trim() || null,
    }
    const { error } = editing
      ? await supabase.from('vehicle_bookings').update(row).eq('id', initial.id)
      : await supabase.from('vehicle_bookings').insert(row)
    setBusy(false)
    if (error) {
      // 23P01: 같은 차량 시간 겹침 (그 사이 다른 사람이 먼저 신청한 경우)
      return setError(error.code === '23P01' ? '방금 다른 분이 같은 시간에 이 차량을 신청했습니다. 다른 차량이나 시간을 골라 주세요.' : toKorean(error.message))
    }
    refresh(); notify(editing ? '차량 신청을 고쳤습니다.' : '차량을 신청했습니다.'); onClose()
  }

  async function cancelBooking() {
    setBusy(true)
    const { error } = await supabase.from('vehicle_bookings').delete().eq('id', initial.id)
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    refresh(); notify('차량 신청을 취소했습니다.'); onClose()
  }

  return (
    <Modal title={editing ? '차량 신청 고치기' : '차량 신청'} onClose={onClose} onSubmit={save}
      footer={<>
        {editing && <button type="button" className="btn btn-danger" onClick={cancelBooking} disabled={busy}>신청 취소</button>}
        <button type="button" className="btn" onClick={onClose}>닫기</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : editing ? '저장' : '신청하기'}</button>
      </>}>
      <p className="muted small">날짜와 시간을 먼저 고르면, 그 시간에 쓸 수 있는 차량만 고를 수 있습니다.</p>
      <div className="field-row three">
        <label className="field">날짜<input type="date" value={f.date} onChange={set('date')} required /></label>
        <label className="field">출발<input type="time" value={f.from} onChange={set('from')} required /></label>
        <label className="field">반납<input type="time" value={f.to} onChange={set('to')} required /></label>
      </div>
      <fieldset className="car-pick">
        <legend>차량</legend>
        {vehicles.length === 0 && <p className="muted small">등록된 차량이 없습니다. 관리자가 회원 관리 화면에서 차량을 등록해야 합니다.</p>}
        {vehicles.map((v) => {
          const c = clash(v.id)
          const [a, b] = c ? c.span : []
          return (
            <label key={v.id} className={`car-option${c ? ' is-taken' : ''}${f.vehicle_id === v.id ? ' is-on' : ''}`}>
              <input type="radio" name="vehicle" disabled={Boolean(c) || !valid} checked={f.vehicle_id === v.id} onChange={() => setF({ ...f, vehicle_id: v.id })} />
              <span className="grow"><b>{v.name}</b>{v.plate && <small> · {v.plate}</small>}<br />
                <small>{c ? `이미 예약됨 · ${deptName(departments, c.dept_id) || '예약'} ${hm(a)}–${hm(b)}` : '이 시간에 쓸 수 있음'}</small>
              </span>
              <span className={`chip${c ? ' chip-plain' : ''}`}>{c ? '선택 불가' : '가능'}</span>
            </label>
          )
        })}
      </fieldset>
      <DeptSelect value={f.dept_id} onChange={(v) => setF({ ...f, dept_id: v })} />
      <div className="field-row">
        <label className="field">운전자<input value={f.driver} onChange={set('driver')} /></label>
        <label className="field">목적·행선지<input value={f.purpose} onChange={set('purpose')} /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

/* ---------- 홈: 주간 캘린더 ---------- */
export function WeekCalendar() {
  const { departments, version, openModal } = useData()
  const [week0, setWeek0] = useState(startOfWeek())
  const [events, setEvents] = useState(null)
  const days = [...Array(7)].map((_, i) => addDays(week0, i))
  const today = new Date()

  useEffect(() => {
    setEvents(null)
    supabase.from('events').select('*').gte('starts_at', week0.toISOString()).lt('starts_at', addDays(week0, 7).toISOString()).order('starts_at')
      .then(({ data }) => setEvents(data ?? []))
  }, [week0, version])

  return (
    <section className="block" aria-labelledby="week-h">
      <div className="block-head">
        <h2 id="week-h" className="pill">Weekly Calendar</h2>
        <div className="month-nav">
          <button type="button" className="icon-btn light" aria-label="이전 주" onClick={() => setWeek0(addDays(week0, -7))}>‹</button>
          <button type="button" className="icon-btn light" aria-label="다음 주" onClick={() => setWeek0(addDays(week0, 7))}>›</button>
        </div>
        <strong className="grow">{week0.getFullYear()}년 {kDate(days[0]).replace(/ \(.\)/, '')} – {kDate(days[6]).replace(/ \(.\)/, '')}</strong>
        {GROUPS.map((g) => <span key={g.id} className={`tag tag-${g.id} round`}>{g.name}</span>)}
        <a href="#calendar" className="btn btn-link">월별로 보기</a>
      </div>
      <div className="card scroll-x">
        <div className="week">
          {days.map((d) => {
            const list = (events ?? []).filter((e) => sameDay(new Date(e.starts_at), d))
            return (
              <div key={ymd(d)} className={`week-day${sameDay(d, today) ? ' is-today' : ''}`}>
                <span className="week-head" data-ko={`${d.getDate()} ${DOW_KO[d.getDay()]}`}><span>{DOW_EN[d.getDay()]} · {d.getDate()}</span></span>
                {events === null && <span className="skeleton" />}
                {list.map((e) => (
                  <button key={e.id} type="button" className={`tag ${deptTag(departments, e.dept_id)} tag-btn`} onClick={() => openModal({ type: 'event', initial: e })}>
                    {hm(new Date(e.starts_at))} {e.title}
                    {e.dept_id !== 'all' && <small>{deptName(departments, e.dept_id)}</small>}
                  </button>
                ))}
                <button type="button" className="add-slot" aria-label={`${kDate(d)} 일정 등록`} onClick={() => openModal({ type: 'event', initial: { date: ymd(d) } })}>+</button>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ---------- 차량 예약 불러오기 ---------- */
function useBookings(from, to) {
  const { version } = useData()
  const [list, setList] = useState(null)
  useEffect(() => {
    setList(null)
    supabase.from('vehicle_bookings').select('*').overlaps('during', range(from, to))
      .then(({ data }) => setList((data ?? []).map((x) => ({ ...x, span: parseRange(x.during) }))))
  }, [from.getTime(), to.getTime(), version])
  return list
}

function BookingTag({ b, departments, showCar, vehicles }) {
  const { profile } = useAuth()
  const { refresh, notify, openModal } = useData()
  const mine = b.created_by === profile.id || profile.role === 'admin'
  async function cancel() {
    const { error } = await supabase.from('vehicle_bookings').delete().eq('id', b.id)
    if (error) return notify(toKorean(error.message))
    refresh(); notify('차량 신청을 취소했습니다.')
  }
  const label = <>
    {showCar && <b>{vehicles.find((v) => v.id === b.vehicle_id)?.name}</b>}
    <b>{deptName(departments, b.dept_id) || '예약'}</b>
    {hm(b.span[0])} – {hm(b.span[1])}
  </>
  if (!mine) return <span className={`tag ${deptTag(departments, b.dept_id)}`}>{label}</span>
  return (
    <span className={`tag ${deptTag(departments, b.dept_id)}`}>
      <button type="button" className="tag-edit" title="눌러서 고치기" onClick={() => openModal({ type: 'car', initial: b })}>{label}</button>
      <button type="button" className="tag-x" aria-label="신청 취소" title="신청 취소" onClick={cancel}>취소</button>
    </span>
  )
}

/* ---------- 홈: 차량 현황 (주간) ---------- */
export function CarsWeek() {
  const { departments, vehicles, openModal } = useData()
  const week0 = startOfWeek()
  const days = [...Array(7)].map((_, i) => addDays(week0, i))
  const bookings = useBookings(week0, addDays(week0, 7))
  const today = new Date()
  return (
    <section className="block" aria-labelledby="car-h">
      <div className="block-head">
        <h2 id="car-h" className="pill">차량 현황</h2>
        <strong className="grow">이번 주</strong>
        <a href="#cars" className="btn btn-link">월별로 보기</a>
      </div>
      <div className="card scroll-x">
        {vehicles.length === 0 ? (
          <div className="empty">등록된 차량이 없습니다. 관리자가 회원 관리 화면에서 차량을 등록하면 여기에 나타납니다.</div>
        ) : (
          <table className="car-cal">
            <thead>
              <tr>
                <th scope="col">차량</th>
                {days.map((d) => <th key={ymd(d)} scope="col" className={sameDay(d, today) ? 'is-today' : ''}>{DOW_EN[d.getDay()]} · {d.getDate()}</th>)}
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <th scope="row">{v.name}</th>
                  {days.map((d) => (
                    <td key={ymd(d)} className={sameDay(d, today) ? 'is-today' : ''}>
                      {(bookings ?? []).filter((b) => b.vehicle_id === v.id && sameDay(b.span[0], d)).map((b) => <BookingTag key={b.id} b={b} departments={departments} />)}
                      <button type="button" className="add-slot" aria-label={`${kDate(d)} ${v.name} 신청`} onClick={() => openModal({ type: 'car', initial: { date: ymd(d) } })}>+</button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {vehicles.length > 0 && (
          <ul className="car-agenda" aria-label="이번 주 차량 신청 (휴대폰 보기)">
            {days.map((d) => {
              const list = (bookings ?? []).filter((b) => sameDay(b.span[0], d))
              return (
                <li key={ymd(d)} className={sameDay(d, today) ? 'is-today' : ''}>
                  <span className="agenda-date">{d.getDate()}<small>{DOW_KO[d.getDay()]}</small></span>
                  <div className="agenda-items">
                    {list.length ? list.map((b) => <BookingTag key={b.id} b={b} departments={departments} vehicles={vehicles} showCar />) : <span className="muted small">신청 없음</span>}
                  </div>
                  <button type="button" className="agenda-add" aria-label={`${kDate(d)} 차량 신청`} onClick={() => openModal({ type: 'car', initial: { date: ymd(d) } })}>+</button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

/* ---------- 차량 현황 (월별) ---------- */
export function CarsMonth() {
  const { departments, vehicles, openModal } = useData()
  const now = new Date()
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const [filter, setFilter] = useState('all')
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const bookings = useBookings(month, next)
  const cells = []
  for (let i = 0; i < month.getDay(); i++) cells.push(null)
  for (let d = new Date(month); d < next; d = addDays(d, 1)) cells.push(d)
  while (cells.length % 7) cells.push(null)
  const shown = (bookings ?? []).filter((b) => filter === 'all' || b.vehicle_id === filter)

  return (
    <>
      <header className="title">
        <h1 className="display page-title">VEHICLE</h1>
        <span className="muted">차량 현황 · 월별</span>
      </header>
      <section className="block" aria-labelledby="month-h">
        <div className="block-head">
          <h2 id="month-h" className="pill">{month.getFullYear()}년 {month.getMonth() + 1}월</h2>
          <div className="month-nav">
            <button type="button" className="icon-btn light" aria-label="이전 달" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <button type="button" className="icon-btn light" aria-label="다음 달" onClick={() => setMonth(next)}>›</button>
          </div>
          <div className="tabs grow">
            <button type="button" className={`tab${filter === 'all' ? ' is-on' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>전체 차량</button>
            {vehicles.map((v) => (
              <button key={v.id} type="button" className={`tab${filter === v.id ? ' is-on' : ''}`} aria-pressed={filter === v.id} onClick={() => setFilter(v.id)}>{v.name}</button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openModal({ type: 'car' })}>+ 차량 신청</button>
        </div>
        <div className="card scroll-x">
          <div className="month month-hide-empty" data-empty="이번 달 차량 신청이 없습니다.">
            {DOW_KO.map((w) => <span key={w} className="month-dow">{w}</span>)}
            {cells.map((d, i) => (
              <div key={i} className={`month-cell${d === null ? ' is-empty' : ''}${d && sameDay(d, now) ? ' is-today' : ''}`}>
                {d && <span className="month-date" data-dow={DOW_KO[d.getDay()]}>{d.getDate()}</span>}
                {d && shown.filter((b) => sameDay(b.span[0], d)).map((b) => <BookingTag key={b.id} b={b} departments={departments} vehicles={vehicles} showCar />)}
              </div>
            ))}
          </div>
        </div>
        <p className="note">같은 차량은 시간이 겹치게 신청할 수 없습니다. 내가 신청한 예약은 "취소"로 지울 수 있습니다.</p>
      </section>
    </>
  )
}

/* ---------- 관리자: 차량 등록 ---------- */
export function VehicleAdmin() {
  const { vehicles, refresh, notify } = useData()
  const [name, setName] = useState('')
  const [plate, setPlate] = useState('')
  const [error, setError] = useState('')

  async function add(e) {
    e.preventDefault()
    if (!name.trim()) return setError('차량 이름을 적어 주세요.')
    const { error } = await supabase.from('vehicles').insert({ name: name.trim(), plate: plate.trim() || null, sort: vehicles.length })
    if (error) return setError(toKorean(error.message))
    setName(''); setPlate(''); setError(''); refresh(); notify('차량을 등록했습니다.')
  }
  async function retire(v) {
    const { error } = await supabase.from('vehicles').update({ active: false }).eq('id', v.id)
    if (error) return notify(toKorean(error.message))
    refresh(); notify(`${v.name}을(를) 목록에서 뺐습니다.`)
  }

  return (
    <section className="block" aria-labelledby="veh-h">
      <h2 id="veh-h" className="pill">차량 {vehicles.length}</h2>
      <div className="card">
        {vehicles.map((v) => (
          <div key={v.id} className="member-row">
            <div className="grow"><strong>{v.name}</strong>{v.plate && <span className="muted small"> · {v.plate}</span>}</div>
            <button type="button" className="btn" onClick={() => retire(v)}>목록에서 빼기</button>
          </div>
        ))}
        <form className="inline-form" onSubmit={add}>
          <label className="field grow">차량 이름<input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 스타렉스" /></label>
          <label className="field"><span>번호판 <small>(선택)</small></span><input value={plate} onChange={(e) => setPlate(e.target.value)} /></label>
          <button type="submit" className="btn btn-primary">차량 등록</button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </section>
  )
}

/* ---------- 교회 캘린더 (월별) ---------- */
export function CalendarMonth() {
  const { departments, version, openModal } = useData()
  const now = new Date()
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const [group, setGroup] = useState('every') // every | all | edu | parish
  const [dept, setDept] = useState('') // 부서 하나만 볼 때
  const [events, setEvents] = useState(null)
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1)

  useEffect(() => {
    setEvents(null)
    supabase.from('events').select('*').gte('starts_at', month.toISOString()).lt('starts_at', next.toISOString()).order('starts_at')
      .then(({ data }) => setEvents(data ?? []))
  }, [month.getTime(), version])

  const grpOf = (id) => departments.find((d) => d.id === id)?.grp ?? 'all'
  const shown = (events ?? []).filter((e) => (dept ? e.dept_id === dept : group === 'every' || grpOf(e.dept_id) === group))
  const cells = []
  for (let i = 0; i < month.getDay(); i++) cells.push(null)
  for (let d = new Date(month); d < next; d = addDays(d, 1)) cells.push(d)
  while (cells.length % 7) cells.push(null)
  const groupTabs = [{ id: 'every', name: '모두' }, ...GROUPS]
  const deptsOf = (g) => departments.filter((d) => d.grp === g)

  return (
    <>
      <header className="title">
        <h1 className="display page-title">CALENDAR</h1>
        <span className="muted">교회 캘린더 · 월별 · 부서마다 등록한 일정을 한눈에</span>
      </header>
      <section className="block" aria-labelledby="cal-h">
        <div className="block-head">
          <h2 id="cal-h" className="pill">{month.getFullYear()}년 {month.getMonth() + 1}월</h2>
          <div className="month-nav">
            <button type="button" className="icon-btn light" aria-label="이전 달" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <button type="button" className="icon-btn light" aria-label="다음 달" onClick={() => setMonth(next)}>›</button>
          </div>
          <div className="tabs">
            {groupTabs.map((g) => (
              <button key={g.id} type="button" className={`tab${!dept && group === g.id ? ' is-on' : ''}`} aria-pressed={!dept && group === g.id}
                onClick={() => { setGroup(g.id); setDept('') }}>{g.name}</button>
            ))}
          </div>
          <label className="inline-select grow">
            <span className="visually-hidden">부서 하나만 보기</span>
            <select value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">부서 하나만 보기</option>
              <optgroup label="교육부">{deptsOf('edu').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
              <optgroup label="교구">{deptsOf('parish').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={() => openModal({ type: 'event', initial: { date: ymd(month.getMonth() === now.getMonth() ? now : month) } })}>+ 일정 등록</button>
        </div>
        <div className="card scroll-x">
          <div className="month month-hide-empty" data-empty="이번 달 일정이 없습니다.">
            {DOW_KO.map((w) => <span key={w} className="month-dow">{w}</span>)}
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="month-cell is-empty" />
              const list = shown.filter((e) => sameDay(new Date(e.starts_at), d))
              return (
                <div key={i} className={`month-cell${sameDay(d, now) ? ' is-today' : ''}`}>
                  <span className="month-date" data-dow={DOW_KO[d.getDay()]}>{d.getDate()}</span>
                  {events === null && <span className="skeleton" />}
                  {list.map((e) => (
                    <button key={e.id} type="button" className={`tag ${deptTag(departments, e.dept_id)} tag-btn`} onClick={() => openModal({ type: 'event', initial: e })}>
                      {hm(new Date(e.starts_at))} {e.title}
                      {e.dept_id !== 'all' && <small>{deptName(departments, e.dept_id)}</small>}
                    </button>
                  ))}
                  <button type="button" className="add-slot" aria-label={`${kDate(d)} 일정 등록`} onClick={() => openModal({ type: 'event', initial: { date: ymd(d) } })}>+</button>
                </div>
              )
            })}
          </div>
        </div>
        <p className="note">
          {dept ? `${deptName(departments, dept)} 일정만 보고 있습니다.` : `이번 달 일정 ${shown.length}개.`} 날짜 칸의 + 로 그날 일정을 등록하고, 일정을 누르면 내용을 보거나 고칠 수 있습니다.
        </p>
      </section>
    </>
  )
}
