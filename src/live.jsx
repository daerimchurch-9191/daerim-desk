// 실제 데이터(Supabase)와 연결된 부분: 교회 일정, 차량 예약
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, useAuth, toKorean, can } from './auth.jsx'
import { useMyDuties } from './devotions.jsx'

/* ---------- 날짜 ---------- */
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DOW_KO = ['일', '월', '화', '수', '목', '금', '토']
export const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const startOfWeek = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -x.getDay()) }
export const sameDay = (a, b) => ymd(a) === ymd(b)
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`
// 휴대폰 화면(700px 이하)인가
export function useIsPhone() {
  const q = '(max-width: 700px)'
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const f = () => setOn(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return on
}
// 세부 페이지의 월별/주별 선택을 기억한다 (탭을 닫으면 처음엔 월별)
export function useView(key) {
  const k = `view:${key}`
  const [v, setV] = useState(() => { try { return sessionStorage.getItem(k) || 'month' } catch { return 'month' } })
  return [v, (x) => { setV(x); try { sessionStorage.setItem(k, x) } catch { /* 저장 못 해도 괜찮음 */ } }]
}
const local = (date, time) => new Date(`${date}T${time || '00:00'}`)
// 여러 날 일정: 이 날짜에 걸쳐 있는가 (종일 일정의 끝은 다음 날 0시, 그날은 포함하지 않는다)
const dayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const onDay = (e, d) => {
  const s = new Date(e.starts_at), d0 = dayOf(d), d1 = addDays(d0, 1)
  const end = e.ends_at ? new Date(e.ends_at) : s
  return s < d1 && (end > d0 || sameDay(s, d))
}
// 날짜 칸에 보일 글: 첫날은 시간(또는 종일), 이어지는 날은 (2/5) 표시
export const eventText = (e, d) => {
  const s = new Date(e.starts_at)
  const last = e.ends_at ? new Date(new Date(e.ends_at).getTime() - 1) : s
  const days = Math.round((dayOf(last) - dayOf(s)) / 864e5) + 1
  const nth = Math.round((dayOf(d) - dayOf(s)) / 864e5) + 1
  const when = nth === 1 && !e.no_time ? (e.all_day ? '종일' : hm(s)) : ''
  return `${when ? when + ' ' : ''}${e.title}${days > 1 ? ` (${nth}/${days})` : ''}`
}
// 여러 날 일정은 이어지는 막대로: 한 줄(주) 안에서 막대마다 층(lane)을 정해 날짜 칸끼리 높이를 맞춘다.
// rowDays: 그 줄의 날짜들(빈 칸은 null). 돌려주는 값: 날짜마다 [{ bar, e, l, r, head } | { gap }] 와 하루짜리 일정 목록
const lastDay = (e) => { const s = new Date(e.starts_at); return dayOf(e.ends_at ? new Date(new Date(e.ends_at).getTime() - 1) : s) }
export const isMulti = (e) => lastDay(e) > dayOf(new Date(e.starts_at))
export function layoutRow(rowDays, events) {
  const multi = events.filter(isMulti)
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at) || lastDay(b) - lastDay(a))
  const lanes = [] // lanes[n] = Set(칸 번호)
  const placed = []
  for (const e of multi) {
    const idx = rowDays.map((d, i) => (d && onDay(e, d) ? i : -1)).filter((i) => i >= 0)
    if (!idx.length) continue
    let n = lanes.findIndex((set) => idx.every((i) => !set.has(i)))
    if (n < 0) { n = lanes.length; lanes.push(new Set()) }
    idx.forEach((i) => lanes[n].add(i))
    placed.push({ e, n, idx })
  }
  return rowDays.map((d, i) => {
    if (!d) return { bars: [], singles: [] }
    const here = placed.filter((p) => p.idx.includes(i))
    const top = here.reduce((m, p) => Math.max(m, p.n), -1)
    const bars = [...Array(top + 1)].map((_, n) => {
      const p = here.find((x) => x.n === n)
      if (!p) return { gap: true, key: `g${n}` }
      return { bar: true, key: `b${p.e.id}`, e: p.e, head: i === p.idx[0],
        l: sameDay(d, new Date(p.e.starts_at)), r: sameDay(d, lastDay(p.e)) }
    })
    return { bars, singles: events.filter((e) => !isMulti(e) && onDay(e, d)) }
  })
}
export function BarTag({ b, d, cls, onOpen }) {
  const e = b.e
  const short = `${b.l && !e.all_day ? hm(new Date(e.starts_at)) + ' ' : ''}${e.title}`
  return (
    <button type="button" title={e.title} className={`tag ${cls} tag-btn bar${b.l ? ' bar-l' : ''}${b.r ? ' bar-r' : ''}${b.head ? ' bar-head' : ''}`} onClick={() => onOpen(e)}>
      <span className="bar-short">{short}</span><span className="bar-full">{eventText(e, d)}</span>
    </button>
  )
}

// 날짜 칸 글: 시간 부분을 따로 감싸 둔다 (휴대폰 달력 칸에서는 시간을 숨기고 제목만)
export function EventLabel({ e, d }) {
  const t = eventText(e, d)
  const s = new Date(e.starts_at)
  const when = sameDay(s, d) && !e.no_time ? (e.all_day ? '종일' : hm(s)) : ''
  return when ? <><span className="ev-time">{when} </span>{t.slice(when.length + 1)}</> : t
}

// 기간이 겹치는 일정 가져오기
const overlapping = (q, from, to) => q.lt('starts_at', to.toISOString())
  .or(`ends_at.gt.${from.toISOString()},and(ends_at.is.null,starts_at.gte.${from.toISOString()})`)
const range = (a, b) => `[${a.toISOString()},${b.toISOString()})`
const kDate = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW_KO[d.getDay()]})`

// '["2026-11-14 00:00:00+00","2026-11-14 06:00:00+00")' → [Date, Date]
export function parseRange(r) {
  const m = r.match(/^[[(]"?([^",]+)"?,"?([^",\])]+)"?[\])]$/)
  const fix = (s) => new Date(s.trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'))
  return [fix(m[1]), fix(m[2])]
}

/* ---------- 공용 데이터 ---------- */
const DataContext = createContext(null)
export const useData = () => useContext(DataContext)
// 일정 누르기: 내 설교·경건회 순서(open 이 있는 줄)는 그 창으로, 나머지는 일정 창으로
export const useOpenEvent = () => {
  const { openModal } = useData()
  return (e) => (e.open ? e.open() : openModal({ type: 'event', initial: e }))
}
// 일정 + 내 설교·경건회 순서 (둘 다 불러와야 보여준다)
const withDuties = (events, duties) => (events && duties ? [...events, ...duties].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)) : null)
const whenText = (e, d) => (!sameDay(new Date(e.starts_at), d) ? '이어짐' : e.no_time ? '' : e.all_day ? '종일' : hm(new Date(e.starts_at)))

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
    supabase.from('profiles').select('id, name, title, rank').eq('status', 'approved').order('name').then(({ data }) => setStaff(data ?? []))
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
const LEGEND = [...GROUPS, { id: 'personal', name: '개인' }]

// 부서 이름들 (여러 부서)
export const deptNames = (ids, departments) => (ids ?? []).map((id) => departments.find((d) => d.id === id)?.name).filter(Boolean).join(' · ')

// 소속 부서 여러 개 고르기 (가입·정보 수정)
// 직분 (시스템): 부목사의 호칭은 "목사"
export const RANKS = ['담임목사', '부목사', '전도사', '사모', '직원']
// 직분마다 고를 수 있는 소속: 부목사 = 기획·교구·교육, 전도사 = 수련·심방(교구 고름)·교육
const RANK_ROLES = {
  부목사: [{ id: 'r_plan', name: '기획' }, { id: 'parish', name: '교구', sub: 'parish' }, { id: 'edu', name: '교육', sub: 'edu' }],
  전도사: [{ id: 'r_train', name: '수련' }, { id: 'r_visit', name: '심방', sub: 'parish' }, { id: 'edu', name: '교육', sub: 'edu' }],
}
// 직분을 바꾸면 그 직분에서 못 고르는 소속은 뺀다
export const keepDeptsForRank = (rank, ids, departments) => {
  const roles = RANK_ROLES[rank] ?? []
  const grp = (id) => departments.find((d) => d.id === id)?.grp
  return ids.filter((id) => roles.some((r) => r.id === id || (r.sub && grp(id) === r.sub)))
}

// 소속 부서 여러 개 고르기 (가입·정보 수정). 직분에 따라 고를 수 있는 것이 다르다.
export function DeptChecks({ departments, value, onChange, rank }) {
  const roles = RANK_ROLES[rank] ?? []
  const grpOf = (id) => departments.find((d) => d.id === id)?.grp
  const [open, setOpen] = useState(() => Object.fromEntries(roles.filter((r) => r.sub).map((r) => [r.id, value.some((id) => grpOf(id) === r.sub)])))
  if (!roles.length) return rank ? <p className="muted small">{rank}은(는) 소속 부서를 고르지 않습니다.</p> : null
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  const isOn = (r) => (r.sub ? (open[r.id] || (r.id.startsWith('r_') && value.includes(r.id))) : value.includes(r.id))
  function flip(r) {
    if (!r.sub) return toggle(r.id)
    const on = !isOn(r)
    setOpen({ ...open, [r.id]: on })
    // 심방처럼 표시가 따로 있는 것은 함께 넣고 빼고, 끌 때는 그 아래 교구·부서도 뺀다 (다른 항목이 같은 교구를 쓰면 남김)
    let next = value.filter((x) => x !== r.id)
    if (on && r.id.startsWith('r_')) next = [...next, r.id]
    if (!on) {
      const shared = roles.some((o) => o.id !== r.id && o.sub === r.sub && isOn(o))
      if (!shared) next = next.filter((x) => grpOf(x) !== r.sub)
    }
    onChange(next)
  }
  const subs = [...new Set(roles.filter((r) => r.sub && isOn(r)).map((r) => r.sub))]
  return (
    <fieldset className="field dept-fieldset">
      <legend>소속 <small>(여러 개 고를 수 있음)</small></legend>
      <div className="dept-checks">
        {roles.map((r) => (
          <label key={r.id} className={`dept-chip${isOn(r) ? ' is-on' : ''}`}>
            <input type="checkbox" checked={isOn(r)} onChange={() => flip(r)} />{r.name}
          </label>
        ))}
      </div>
      {subs.map((g) => (
        <div key={g} className="dept-checks-group">
          <span className="muted small">{g === 'edu' ? '교육 — 맡은 부서' : '교구 — 맡은 교구'}</span>
          <div className="dept-checks">
            {departments.filter((d) => d.grp === g && d.id !== g).map((d) => (
              <label key={d.id} className={`dept-chip sub${value.includes(d.id) ? ' is-on' : ''}`}>
                <input type="checkbox" checked={value.includes(d.id)} onChange={() => toggle(d.id)} />{d.name}
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  )
}

export function DeptSelect({ value, onChange, custom, onCustom, noAll, personal }) {
  const { departments } = useData()
  const of = (g) => departments.filter((d) => d.grp === g)
  // noAll: 교회 전체를 고를 수 없음(권한 없음) / personal: "개인 (나만 보기)"를 고를 수 있음
  // custom 을 넘기면 "직접 입력"을 고를 수 있다 (value 는 '__custom')
  return (
    <div className="field">
      <label htmlFor="dept-sel">부서</label>
      <select id="dept-sel" value={value} onChange={(e) => onChange(e.target.value)}>
        {personal && <option value="personal">개인 (나만 보기)</option>}
        {!noAll && of('all').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        <optgroup label="교육부">{of('edu').map((d) => <option key={d.id} value={d.id}>{d.id === 'edu' ? '교육부 전체' : d.name}</option>)}</optgroup>
        <optgroup label="교구">{of('parish').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
        {onCustom && <option value="__custom">직접 입력…</option>}
      </select>
      {onCustom && value === '__custom' && <input value={custom} onChange={(e) => onCustom(e.target.value)} placeholder="부서·모임 이름" aria-label="부서 직접 입력" autoFocus />}
    </div>
  )
}

// 시간 고르기: 브라우저 기본 시간칸 대신 10분 단위 목록 (휴대폰에서는 돌림판으로 열림)
const TIMES = [...Array(24 * 6)].map((_, i) => `${pad(Math.floor(i / 6))}:${pad((i % 6) * 10)}`).filter((t) => t >= '05:00')
export const timeLabel = (t) => { const [h, m] = t.split(':').map(Number); return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${pad(m)}` }
export function TimeSelect({ value, onChange, optional, label, ...rest }) {
  const list = value && !TIMES.includes(value) ? [...TIMES, value].sort() : TIMES
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} {...rest}>
      {optional && <option value="">없음</option>}
      {list.map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}
    </select>
  )
}
export const plusMinutes = (t, m) => { const [h, mm] = t.split(':').map(Number); const x = Math.min(h * 60 + mm + m, 23 * 60 + 50); return `${pad(Math.floor(x / 60))}:${pad(x % 60)}` }

// 사람 고르기: 사역자 목록 + 직접 입력. 값은 이름 글자.
export function PersonPick({ label, value, onChange, optional }) {
  const { staff } = useData()
  const names = staff.map((p) => `${p.name} ${p.title}`)
  const [typing, setTyping] = useState(Boolean(value) && !names.includes(value))
  const sel = typing ? '__custom' : value
  return (
    <div className="field">
      <label><span>{label}{optional && <small> (선택)</small>}</span>
        <select value={sel} onChange={(e) => { const v = e.target.value; if (v === '__custom') { setTyping(true); onChange('') } else { setTyping(false); onChange(v) } }}>
          <option value="">{optional ? '고르지 않음' : '고르세요'}</option>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
          <option value="__custom">직접 입력…</option>
        </select>
      </label>
      {typing && <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="이름 입력" aria-label={`${label} 직접 입력`} autoFocus />}
    </div>
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
  const { refresh, notify, departments } = useData()
  const editing = Boolean(initial?.id)
  const canAll = can(profile, 'event_all')
  const myDept = profile.dept_ids?.[0]
  const canEdit = !editing || profile.role === 'admin' || (initial.dept_id === 'all' ? canAll : initial.created_by === profile.id)
  const s = initial?.starts_at ? new Date(initial.starts_at) : null
  const e = initial?.ends_at ? new Date(initial.ends_at) : null
  const [f, setF] = useState({
    title: initial?.title ?? '',
    date: s ? ymd(s) : initial?.date ?? ymd(new Date()),
    end_date: e ? ymd(initial?.all_day ? addDays(e, -1) : e) : (s ? ymd(s) : initial?.date ?? ymd(new Date())),
    start: s ? hm(s) : '10:00',
    end: e ? hm(e) : '',
    all_day: initial?.all_day ?? false,
    dept_id: initial?.dept_id ?? (canAll ? 'all' : myDept ?? 'personal'),
    location: initial?.location ?? '',
    note: initial?.note ?? '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value })

  async function save(ev) {
    ev.preventDefault()
    if (!f.title.trim()) return setError('일정 이름을 적어 주세요.')
    const multi = f.end_date > f.date
    if (f.end_date < f.date) return setError('끝나는 날짜가 시작 날짜보다 앞설 수 없습니다.')
    if (!f.all_day && multi && !f.end) return setError('여러 날 일정은 끝나는 시간을 골라 주세요.')
    if (!f.all_day && !multi && f.end && f.end <= f.start) return setError('끝나는 시간이 시작보다 늦어야 합니다.')
    const row = {
      title: f.title.trim(),
      all_day: f.all_day,
      starts_at: local(f.date, f.all_day ? '00:00' : f.start).toISOString(),
      ends_at: f.all_day ? addDays(local(f.end_date, '00:00'), 1).toISOString() : f.end ? local(f.end_date, f.end).toISOString() : null,
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
        <div className="field-row">
          <label className="field">시작 날짜<input type="date" value={f.date} onChange={(ev) => setF({ ...f, date: ev.target.value, end_date: f.end_date < ev.target.value || f.end_date === f.date ? ev.target.value : f.end_date })} required /></label>
          <label className="field">끝 날짜<input type="date" value={f.end_date} min={f.date} onChange={set('end_date')} required /></label>
        </div>
        {!f.all_day && <div className="field-row">
          <label className="field">시작 시간<TimeSelect value={f.start} onChange={(v) => setF({ ...f, start: v, end: f.end_date === f.date && f.end && f.end <= v ? '' : f.end })} /></label>
          <label className="field"><span>끝 시간 <small>{f.end_date > f.date ? '' : '(선택)'}</small></span><TimeSelect optional value={f.end} onChange={(v) => setF({ ...f, end: v })} /></label>
        </div>}
        <label className="check-line"><input type="checkbox" checked={f.all_day} onChange={(ev) => setF({ ...f, all_day: ev.target.checked })} /> 종일</label>
        {!f.all_day && <div className="quick-row" aria-label="끝 시간 더하기">
          <span className="muted small">끝 시간</span>
          {[[30, '+30분'], [60, '+1시간']].map(([m, t]) => (
            <button key={m} type="button" className="chip-btn" onClick={() => setF({ ...f, end: plusMinutes(f.end || f.start, m) })}>{t}</button>
          ))}
          {f.end && <span className="small">→ {timeLabel(f.end)} 끝</span>}
          {f.end && <button type="button" className="btn-link small" onClick={() => setF({ ...f, end: '' })}>지우기</button>}
        </div>}
        <DeptSelect value={f.dept_id} onChange={(v) => setF({ ...f, dept_id: v })} personal noAll={!canAll && f.dept_id !== 'all'} />
        {f.dept_id === 'personal' && <p className="muted small">개인 일정은 나만 보이고 구글 캘린더에도 올라가지 않습니다.</p>}
        {f.dept_id === 'all' && <p className="muted small">교회 전체 일정은 교회 구글 캘린더에도 함께 올라갑니다.</p>}
        <label className="field"><span>장소 <small>(선택)</small></span><input value={f.location} onChange={set('location')} /></label>
        <label className="field"><span>메모 <small>(선택)</small></span><input value={f.note} onChange={set('note')} /></label>
      </fieldset>
      {!canEdit && <p className="muted small">{initial?.dept_id === 'all' ? '교회 전체 일정은 권한이 있는 사람만 고칠 수 있습니다.' : '등록한 사람과 관리자만 고칠 수 있습니다.'}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

/* ---------- 차량 신청 ---------- */
function CarModal({ initial, onClose }) {
  const { departments, vehicles, refresh, notify } = useData()
  const { profile } = useAuth()
  const myName = `${profile.name} ${profile.title}`
  const editing = Boolean(initial?.id)
  const [f, setF] = useState(editing
    ? { date: ymd(initial.span[0]), from: hm(initial.span[0]), to: hm(initial.span[1]), vehicle_id: initial.vehicle_id, dept_id: initial.dept_text ? '__custom' : (initial.dept_id ?? 'all'), dept_text: initial.dept_text ?? '', driver: initial.driver ?? '', requester: initial.requester ?? '' }
    : { date: initial?.date ?? ymd(new Date()), from: '09:00', to: '12:00', vehicle_id: null, dept_id: 'all', dept_text: '', driver: '', requester: myName })
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
    if (!f.requester.trim()) return setError('신청자를 골라 주세요.')
    if (f.dept_id === '__custom' && !f.dept_text.trim()) return setError('부서 이름을 적어 주세요.')
    setBusy(true)
    const custom = f.dept_id === '__custom'
    const row = {
      vehicle_id: f.vehicle_id, during: range(want[0], want[1]),
      dept_id: custom ? null : f.dept_id, dept_text: custom ? f.dept_text.trim() : null,
      requester: f.requester.trim(), driver: f.driver.trim() || null,
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
        <label className="field">출발<TimeSelect value={f.from} onChange={(v) => setF({ ...f, from: v, to: f.to <= v ? plusMinutes(v, 60) : f.to })} /></label>
        <label className="field">반납<TimeSelect value={f.to} onChange={(v) => setF({ ...f, to: v })} /></label>
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
                <small>{c ? `이미 예약됨 · ${c.dept_text || deptName(departments, c.dept_id) || c.requester || '예약'} ${hm(a)}–${hm(b)}` : '이 시간에 쓸 수 있음'}</small>
              </span>
              <span className={`chip${c ? ' chip-plain' : ''}`}>{c ? '선택 불가' : '가능'}</span>
            </label>
          )
        })}
      </fieldset>
      <DeptSelect value={f.dept_id} onChange={(v) => setF({ ...f, dept_id: v })} custom={f.dept_text} onCustom={(v) => setF({ ...f, dept_text: v })} />
      <div className="field-row">
        <PersonPick label="신청자" value={f.requester} onChange={(v) => setF({ ...f, requester: v })} />
        <PersonPick label="운전자" optional value={f.driver} onChange={(v) => setF({ ...f, driver: v })} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

/* ---------- 홈: 주간 캘린더 ---------- */
// 홈 블록 제목: 세부 페이지가 있으면 누르면 그리로 간다
export function PillLink({ id, href, inPage, children }) {
  return inPage
    ? <h2 id={id} className="sr-only">{children}</h2>
    : <h2 id={id} className="pill pill-link"><a href={href}>{children}<span aria-hidden="true"> ›</span></a></h2>
}

// 홈 카드 머리: 제목(누르면 세부 페이지) · 기간 · ‹ › · 오늘 · 오른쪽 버튼들
export function HomeHead({ id, title, href, range, week0, setWeek0, children }) {
  const thisWeek = startOfWeek()
  return (
    <div className="hc-head">
      <h2 id={id} className="hc-title">{href ? <a href={href}>{title}</a> : title}</h2>
      {range && <span className="hc-range">{range}</span>}
      {setWeek0 && (
        <span className="hc-nav">
          <button type="button" aria-label="이전 주" onClick={() => setWeek0(addDays(week0, -7))}>‹</button>
          <button type="button" aria-label="다음 주" onClick={() => setWeek0(addDays(week0, 7))}>›</button>
          <button type="button" className={`hc-today${sameDay(week0, thisWeek) ? ' is-now' : ''}`} onClick={() => setWeek0(thisWeek)}>오늘</button>
        </span>
      )}
      {children && <span className="hc-right">{children}</span>}
    </div>
  )
}
const rangeText = (a, b) => `${a.getMonth() + 1}.${a.getDate()} – ${b.getMonth() + 1}.${b.getDate()}`
export const weekRange = (week0) => rangeText(week0, addDays(week0, 6))
const dayHead = (d, inPage) => (
  <span className="week-head" data-ko={`${d.getDate()} ${DOW_KO[d.getDay()]}`}>
    {inPage ? <span>{DOW_EN[d.getDay()]} · {d.getDate()}</span> : <span><small>{DOW_KO[d.getDay()]}</small> <b>{d.getDate()}</b></span>}
  </span>
)
const CAL_FILTERS = [['', '전체'], ['all', '교회'], ['edu', '교육부'], ['parish', '교구'], ['personal', '개인']]

// 세부 페이지 제목 옆 월별 / 주별 바꾸기
export function ViewSwitch({ value, onChange }) {
  return (
    <div className="seg" role="group" aria-label="보기 방식">
      {[['month', '월별'], ['week', '주별']].map(([v, t]) => (
        <button key={v} type="button" className={value === v ? 'is-on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{t}</button>
      ))}
    </div>
  )
}

export function WeekCalendar({ inPage }) {
  const { departments, version, openModal } = useData()
  const [week0, setWeek0] = useState(startOfWeek())
  const [raw, setEvents] = useState(null)
  const [grp, setGrp] = useState('')
  const days = [...Array(7)].map((_, i) => addDays(week0, i))
  const today = new Date()
  const openEv = useOpenEvent()
  const events = withDuties(raw, useMyDuties(week0, addDays(week0, 7)))

  useEffect(() => {
    setEvents(null)
    overlapping(supabase.from('events').select('*'), week0, addDays(week0, 7)).order('starts_at')
      .then(({ data }) => setEvents(data ?? []))
  }, [week0, version])

  const grpOf = (e) => departments.find((d) => d.id === e.dept_id)?.grp ?? 'all'
  const shownEvents = events && grp ? events.filter((e) => grpOf(e) === grp) : events

  const grid = (
    <div className="week">
      {(() => { const lay = layoutRow(days, shownEvents ?? []); return days.map((d, di) => {
        const { bars, singles: list } = lay[di]
        return (
          <div key={ymd(d)} className={`week-day${sameDay(d, today) ? ' is-today' : ''}`}>
            {dayHead(d, inPage)}
            {events === null && <span className="skeleton" />}
            {bars.map((b) => b.gap ? <span key={b.key} className="bar-gap" aria-hidden="true" />
              : <BarTag key={b.key} b={b} d={d} cls={deptTag(departments, b.e.dept_id)} onOpen={openEv} />)}
            {list.map((e) => (
              <button key={e.id} type="button" className={`tag ${deptTag(departments, e.dept_id)} tag-btn`} onClick={() => openEv(e)}>
                {eventText(e, d)}
                {e.dept_id !== 'all' && !e.duty && <small>{deptName(departments, e.dept_id)}</small>}
              </button>
            ))}
            <button type="button" className="add-slot" aria-label={`${kDate(d)} 일정 등록`} onClick={() => openModal({ type: 'event', initial: { date: ymd(d) } })}>+</button>
          </div>
        )
      }) })()}
    </div>
  )

  if (!inPage) {
    return (
      <section className="hc" aria-labelledby="week-h">
        <HomeHead id="week-h" title="주간 캘린더" href="#calendar" range={weekRange(week0)} week0={week0} setWeek0={setWeek0}>
          <span className="hc-seg" role="group" aria-label="부서 묶음">
            {CAL_FILTERS.map(([id, name]) => <button key={id} type="button" className={grp === id ? 'is-on' : ''} aria-pressed={grp === id} onClick={() => setGrp(id)}>{name}</button>)}
          </span>
          <a href="#calendar" className="hc-more">교회 캘린더 →</a>
        </HomeHead>
        <div className="hc-scroll">{grid}</div>
        <div className="hc-legend">{LEGEND.map((g) => <span key={g.id} className={`tag tag-${g.id} round`}>{g.name}</span>)}</div>
      </section>
    )
  }

  return (
    <section className="block" aria-labelledby="week-h">
      <div className="block-head">
        <PillLink id="week-h" href="#calendar" inPage={inPage}>주별</PillLink>
        <div className="month-nav">
          <button type="button" className="icon-btn light" aria-label="이전 주" onClick={() => setWeek0(addDays(week0, -7))}>‹</button>
          <button type="button" className="icon-btn light" aria-label="다음 주" onClick={() => setWeek0(addDays(week0, 7))}>›</button>
        </div>
        <strong className="grow">{week0.getFullYear()}년 {kDate(days[0]).replace(/ \(.\)/, '')} – {kDate(days[6]).replace(/ \(.\)/, '')}</strong>
        {LEGEND.map((g) => <span key={g.id} className={`tag tag-${g.id} round`}>{g.name}</span>)}
      </div>
      <div className="card scroll-x">{grid}</div>
    </section>
  )
}

/* ---------- 휴대폰 홈: 오늘 일정 ---------- */
export function TodayCard() {
  const { departments, version, openModal } = useData()
  const [raw, setList] = useState(null)
  const today = new Date()
  const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const openEv = useOpenEvent()
  const list = withDuties(raw, useMyDuties(d0, addDays(d0, 1)))
  useEffect(() => {
    overlapping(supabase.from('events').select('*'), d0, addDays(d0, 1)).order('starts_at')
      .then(({ data }) => setList(data ?? []))
  }, [version])
  return (
    <section className="hc" aria-labelledby="today-h">
      <HomeHead id="today-h" title={<>오늘 <span className="hc-sub">{kDate(today)}</span></>}>
        <a href="#calendar" className="hc-more">캘린더 →</a>
      </HomeHead>
      {list === null && <span className="skeleton" />}
      {list?.length === 0 && <p className="muted small">오늘은 일정이 없습니다.</p>}
      <div className="hc-list">
        {(list ?? []).map((e) => (
          <button key={e.id} type="button" className="hc-row hc-rowbtn" onClick={() => openEv(e)}>
            <span className="ev-when">{whenText(e, today)}</span>
            <span className={`ev-bar ${deptTag(departments, e.dept_id)}`} />
            <span className="hc-text"><b>{e.title}</b><span>{e.duty ? '나만 보기' : deptName(departments, e.dept_id)}</span></span>
            <span className="hc-end chev">›</span>
          </button>
        ))}
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

// 달력에 보일 차량 이름: 번호판이 있으면 "1호차(1414)" (이름의 마지막 낱말 + 번호판), 없으면 이름 그대로
export const carLabel = (v) => (!v ? '' : v.plate ? `${v.name.trim().split(/\s+/).pop()}(${v.plate})` : v.name)

// 차량마다 다른 색 (차량 목록 순서대로)
const CAR_COLORS = [['#DCEBFA', '#1D4E89'], ['#FCE1D6', '#8A3414'], ['#E3F1D2', '#3F5E14'], ['#F7DDEB', '#84205A'], ['#D8F0F0', '#145B5E'], ['#F3EBCB', '#6A5410'], ['#E7E2F6', '#3E2F7A']]
export const carStyle = (vehicles, id) => {
  const i = Math.max(0, vehicles.findIndex((v) => v.id === id))
  const [background, color] = CAR_COLORS[i % CAR_COLORS.length]
  return { background, color }
}

// 차량 신청 자세히 보기 (고칠 수 없는 사람용)
function CarDetail({ b, onClose }) {
  const { vehicles, departments } = useData()
  const v = vehicles.find((x) => x.id === b.vehicle_id)
  const d = b.span[0]
  const row = (k, val) => val ? <p className="detail-row"><span className="muted">{k}</span><b>{val}</b></p> : null
  return (
    <Modal title="차량 신청" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onClose() }}
      footer={<button type="submit" className="btn btn-primary">닫기</button>}>
      {row('차량', v ? `${v.name}${v.plate ? ` (${v.plate})` : ''}` : '')}
      {row('날짜', `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW_KO[d.getDay()]})`)}
      {row('시간', `${hm(b.span[0])} – ${hm(b.span[1])}`)}
      {row('부서', b.dept_text || deptName(departments, b.dept_id))}
      {row('신청자', b.requester)}
      {row('운전자', b.driver)}
    </Modal>
  )
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
    {showCar && <b className="car-name">{carLabel(vehicles.find((v) => v.id === b.vehicle_id)).replace('(', '\u200b(')}</b>}
    <b>{b.dept_text || deptName(departments, b.dept_id) || '예약'}</b>
    {hm(b.span[0])} – {hm(b.span[1])}
    {b.requester && <small>{b.requester}{b.driver && b.driver !== b.requester ? ` · 운전 ${b.driver}` : ''}</small>}
  </>
  const style = carStyle(vehicles, b.vehicle_id)
  // 신청자·관리자가 아니면 눌러서 자세한 내용만 본다 (고치기 없음)
  if (!mine) return (
    <span className="tag tag-car" style={style}>
      <button type="button" className="tag-edit" title="자세히 보기" onClick={() => openModal({ render: (close) => <CarDetail b={b} onClose={close} /> })}>{label}</button>
    </span>
  )
  return (
    <span className="tag tag-car" style={style}>
      <button type="button" className="tag-edit" title="눌러서 고치기" onClick={() => openModal({ type: 'car', initial: b })}>{label}</button>
      <button type="button" className="tag-x" aria-label="신청 취소" title="신청 취소" onClick={cancel}>취소</button>
    </span>
  )
}

/* ---------- 홈: 차량 현황 (주간) ---------- */
export function CarsWeek({ inPage }) {
  const { departments, vehicles, openModal } = useData()
  const [week0, setWeek0] = useState(startOfWeek())
  const days = [...Array(7)].map((_, i) => addDays(week0, i))
  const bookings = useBookings(week0, addDays(week0, 7))
  const today = new Date()
  const body = vehicles.length === 0 ? (
    <div className="empty">등록된 차량이 없습니다. 관리자가 차량 현황 화면에서 차량을 등록하면 여기에 나타납니다.</div>
  ) : (
    <div className="week week-cars">
      {days.map((d) => {
        const list = (bookings ?? []).filter((b) => sameDay(b.span[0], d)).sort((a, b) => a.span[0] - b.span[0])
        return (
          <div key={ymd(d)} className={`week-day${sameDay(d, today) ? ' is-today' : ''}`}>
            {dayHead(d, inPage)}
            {bookings === null && <span className="skeleton" />}
            {list.map((b) => <BookingTag key={b.id} b={b} departments={departments} vehicles={vehicles} showCar />)}
            <button type="button" className="add-slot" aria-label={`${kDate(d)} 차량 신청`} onClick={() => openModal({ type: 'car', initial: { date: ymd(d) } })}>+</button>
          </div>
        )
      })}
    </div>
  )
  const legend = vehicles.length > 0 && (
    <div className="car-legend" aria-label="차량 색">
      {vehicles.map((v) => <span key={v.id} className="tag round" style={carStyle(vehicles, v.id)}>{carLabel(v)}</span>)}
    </div>
  )

  if (!inPage) {
    return (
      <section className="hc" aria-labelledby="car-h">
        <HomeHead id="car-h" title="차량 현황" href="#cars" range={weekRange(week0)} week0={week0} setWeek0={setWeek0}>
          <button type="button" className="hc-btn is-green" onClick={() => openModal({ type: 'car' })}>+ 차량 신청</button>
          <a href="#cars" className="hc-more">차량 현황 →</a>
        </HomeHead>
        <div className="hc-scroll">{body}</div>
        {legend}
      </section>
    )
  }

  return (
    <section className="block" aria-labelledby="car-h">
      <div className="block-head">
        <PillLink id="car-h" href="#cars" inPage={inPage}>주별</PillLink>
        <div className="month-nav">
          <button type="button" className="icon-btn light" aria-label="이전 주" onClick={() => setWeek0(addDays(week0, -7))}>‹</button>
          <button type="button" className="icon-btn light" aria-label="다음 주" onClick={() => setWeek0(addDays(week0, 7))}>›</button>
        </div>
        <strong className="grow">{sameDay(week0, startOfWeek()) ? '이번 주' : `${md(days[0])} – ${md(days[6])}`}</strong>
      </div>
      <div className="card scroll-x">{body}{legend}</div>
    </section>
  )
}

/* ---------- 차량 현황 (월별) ---------- */
export function CarsMonth() {
  const { departments, vehicles, openModal } = useData()
  const { profile } = useAuth()
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
  const [view, setView] = useView('cars')

  return (
    <>
      <header className="title">
        <h1 className="page-title page-title-ko">차량 현황</h1>
        <ViewSwitch value={view} onChange={setView} />
      </header>
      {view === 'week' ? <CarsWeek inPage /> : <section className="block" aria-labelledby="month-h">
        <div className="block-head">
          <h2 id="month-h" className="pill">{month.getFullYear()}년 {month.getMonth() + 1}월</h2>
          <div className="month-nav">
            <button type="button" className="icon-btn light" aria-label="이전 달" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <button type="button" className="icon-btn light" aria-label="다음 달" onClick={() => setMonth(next)}>›</button>
          </div>
          <div className="tabs grow">
            <button type="button" className={`tab${filter === 'all' ? ' is-on' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>전체 차량</button>
            {vehicles.map((v) => (
              <button key={v.id} type="button" className={`tab${filter === v.id ? ' is-on' : ''}`} aria-pressed={filter === v.id} onClick={() => setFilter(v.id)}>{carLabel(v)}</button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => openModal({ type: 'car' })}>+ 차량 신청</button>
        </div>
        <div className="card scroll-x">
          <div className="month month-grid-always">
            {DOW_KO.map((w) => <span key={w} className="month-dow">{w}</span>)}
            {cells.map((d, i) => (
              <div key={i} className={`month-cell${d === null ? ' is-empty' : ''}${d && sameDay(d, now) ? ' is-today' : ''}`}>
                {d && <span className="month-date" data-dow={DOW_KO[d.getDay()]}>{d.getDate()}</span>}
                {d && shown.filter((b) => sameDay(b.span[0], d)).map((b) => <BookingTag key={b.id} b={b} departments={departments} vehicles={vehicles} showCar />)}
              </div>
            ))}
          </div>
        </div>
      </section>}
      {profile.role === 'admin' && <VehicleAdmin />}
    </>
  )
}

/* ---------- 차량 등록 (관리자만) ---------- */
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
  const [raw, setEvents] = useState(null)
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const openEv = useOpenEvent()
  const events = withDuties(raw, useMyDuties(month, next))

  useEffect(() => {
    setEvents(null)
    overlapping(supabase.from('events').select('*'), month, next).order('starts_at')
      .then(({ data }) => setEvents(data ?? []))
  }, [month.getTime(), version])

  const grpOf = (id) => departments.find((d) => d.id === id)?.grp ?? 'all'
  const shown = (events ?? []).filter((e) => (dept ? e.dept_id === dept : group === 'every' || grpOf(e.dept_id) === group))
  const cells = []
  for (let i = 0; i < month.getDay(); i++) cells.push(null)
  for (let d = new Date(month); d < next; d = addDays(d, 1)) cells.push(d)
  while (cells.length % 7) cells.push(null)
  const groupTabs = [{ id: 'every', name: '모두' }, ...GROUPS, { id: 'personal', name: '개인' }]
  const deptsOf = (g) => departments.filter((d) => d.grp === g)
  const [view, setView] = useView('calendar')
  const phone = useIsPhone()
  const [pick, setPick] = useState(null)
  const picked = pick ?? (month.getMonth() === now.getMonth() && month.getFullYear() === now.getFullYear() ? now : month)
  const pickedList = shown.filter((e) => onDay(e, picked)).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))

  return (
    <>
      <header className="title">
        <h1 className="page-title page-title-ko">교회 캘린더</h1>
        <ViewSwitch value={view} onChange={setView} />
      </header>
      {view === 'week' ? <WeekCalendar inPage /> : <section className="block" aria-labelledby="cal-h">
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
              <optgroup label="교육부">{deptsOf('edu').map((d) => <option key={d.id} value={d.id}>{d.id === 'edu' ? '교육부 전체' : d.name}</option>)}</optgroup>
              <optgroup label="교구">{deptsOf('parish').map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={() => openModal({ type: 'event', initial: { date: ymd(month.getMonth() === now.getMonth() ? now : month) } })}>+ 일정 등록</button>
        </div>
        <div className="card scroll-x">
          <div className="month month-grid-always">
            {DOW_KO.map((w) => <span key={w} className="month-dow">{w}</span>)}
            {(() => { const lay = cells.flatMap((_, i) => (i % 7 ? [] : layoutRow(cells.slice(i, i + 7), shown))); return cells.map((d, i) => {
              if (!d) return <div key={i} className="month-cell is-empty" />
              const { bars, singles: list } = lay[i]
              return (
                <div key={i} className={`month-cell${sameDay(d, now) ? ' is-today' : ''}${phone && sameDay(d, picked) ? ' is-picked' : ''}`}
                  onClick={phone ? () => setPick(d) : undefined}>
                  <span className="month-date" data-dow={DOW_KO[d.getDay()]}>{d.getDate()}</span>
                  {events === null && <span className="skeleton" />}
                  {bars.map((b) => b.gap ? <span key={b.key} className="bar-gap" aria-hidden="true" />
                    : <BarTag key={b.key} b={b} d={d} cls={deptTag(departments, b.e.dept_id)} onOpen={openEv} />)}
                  {list.map((e) => (
                    <button key={e.id} type="button" className={`tag ${deptTag(departments, e.dept_id)} tag-btn`} onClick={() => openEv(e)}>
                      <EventLabel e={e} d={d} />
                      {e.dept_id !== 'all' && !e.duty && <small>{deptName(departments, e.dept_id)}</small>}
                    </button>
                  ))}
                  <button type="button" className="add-slot" aria-label={`${kDate(d)} 일정 등록`} onClick={() => openModal({ type: 'event', initial: { date: ymd(d) } })}>+</button>
                </div>
              )
            }) })()}
          </div>
        </div>
        {phone && events !== null && (
          <div className="hc day-panel">
            <div className="hc-head">
              <h2 className="hc-title">{kDate(picked)}</h2>
              <span className="hc-right"><button type="button" className="hc-btn is-green" onClick={() => openModal({ type: 'event', initial: { date: ymd(picked) } })}>+ 이 날 일정</button></span>
            </div>
            {pickedList.length === 0 && <p className="muted small">이 날은 일정이 없습니다.</p>}
            <div className="hc-list">
              {pickedList.map((e) => (
                <button key={e.id} type="button" className="hc-row hc-rowbtn" onClick={() => openEv(e)}>
                  <span className="ev-when">{whenText(e, picked)}</span>
                  <span className={`ev-bar ${deptTag(departments, e.dept_id)}`} />
                  <span className="hc-text"><b>{e.title}</b><span>{deptName(departments, e.dept_id)}{e.location ? ` · ${e.location}` : ''}</span></span>
                  <span className="hc-end chev">›</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>}
    </>
  )
}
