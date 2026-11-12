// 예배 설교표(모두 함께)와 내 설교(본인). 같은 표(sermons)의 같은 줄을 보여주므로
// 어느 쪽에서 본문을 고쳐도 양쪽이 함께 바뀐다.
import { useEffect, useState } from 'react'
import { supabase, useAuth, toKorean } from './auth.jsx'
import { useData, Modal, ymd, addDays, startOfWeek, DOW_KO } from './live.jsx'

export const SERVICES = {
  dawn: { name: '새벽기도회', time: '05:30' },
  wed: { name: '수요예배', time: '19:30' },
  fri: { name: '금요기도회', time: '20:30' },
  special: { name: '특별 예배', time: '' },
  other: { name: '내 설교', time: '' },
}
const SLOT = ['dawn', 'wed', 'fri'] // 날짜마다 한 칸뿐인 예배
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`
const dayLabel = (d) => `${DOW_KO[d.getDay()]} ${d.getDate()}`
const toDate = (s) => new Date(`${s}T00:00`)
const hhmm = (t) => (t ? t.slice(0, 5) : '')
const isEmpty = (s) => !s || (!s.preacher_id && !s.preacher_name && !s.passage)

function usePreacherName() {
  const { staff } = useData()
  return (s) => {
    if (s.preacher_id) {
      const p = staff.find((x) => x.id === s.preacher_id)
      return p ? `${p.name} ${p.title}` : '(알 수 없는 사역자)'
    }
    return s.preacher_name || ''
  }
}

/* ---------- 입력 창 ---------- */
function SermonModal({ initial, onClose }) {
  const { profile } = useAuth()
  const { staff, refresh, notify } = useData()
  const editing = Boolean(initial.id)
  const slot = SLOT.includes(initial.service)
  const personal = initial.service === 'other'
  const [f, setF] = useState({
    title: initial.title ?? '',
    date: initial.date ?? ymd(new Date()),
    time: hhmm(initial.time) || SERVICES[initial.service].time,
    who: initial.preacher_id ?? (initial.preacher_name ? 'text' : personal ? profile.id : ''),
    name: initial.preacher_name ?? '',
    passage: initial.passage ?? '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function run(action, done) {
    setBusy(true)
    const { error } = await action
    setBusy(false)
    if (error) {
      return setError(error.code === '23505' ? '방금 다른 분이 이 칸을 먼저 입력했습니다. 닫고 다시 열어 주세요.' : toKorean(error.message))
    }
    refresh(); notify(done); onClose()
  }

  function save(e) {
    e.preventDefault()
    if (!slot && !f.title.trim()) return setError('예배 이름을 적어 주세요.')
    if (f.who === 'text' && !f.name.trim()) return setError('설교자 이름을 적어 주세요.')
    const row = {
      service: initial.service,
      title: slot ? null : f.title.trim(),
      date: f.date,
      time: f.time || null,
      preacher_id: f.who && f.who !== 'text' ? f.who : null,
      preacher_name: f.who === 'text' ? f.name.trim() : null,
      passage: f.passage.trim() || null,
      is_public: !personal,
    }
    run(editing ? supabase.from('sermons').update(row).eq('id', initial.id) : supabase.from('sermons').insert(row), '설교를 저장했습니다.')
  }
  // 정해진 칸(새벽·수요·금요)은 내용만 비우고, 특별 예배와 내 설교는 줄을 지운다
  const clear = () => run(
    slot
      ? supabase.from('sermons').update({ preacher_id: null, preacher_name: null, passage: null }).eq('id', initial.id)
      : supabase.from('sermons').delete().eq('id', initial.id),
    slot ? '칸을 비웠습니다.' : '설교를 지웠습니다.',
  )

  const d = toDate(f.date)
  return (
    <Modal title={slot ? SERVICES[initial.service].name : personal ? '내 설교' : '특별 예배'} onClose={onClose} onSubmit={save}
      footer={<>
        {editing && <button type="button" className="btn btn-danger" onClick={clear} disabled={busy}>{slot ? '비우기' : '삭제'}</button>}
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </>}>
      {slot ? (
        <p><strong>{d.getMonth() + 1}월 {d.getDate()}일 ({DOW_KO[d.getDay()]}) {f.time}</strong></p>
      ) : (
        <>
          <label className="field">예배 이름<input value={f.title} onChange={set('title')} placeholder={personal ? '예: 유년부 예배' : '예: 연합속회'} autoFocus /></label>
          <div className="field-row">
            <label className="field">날짜<input type="date" value={f.date} onChange={set('date')} required /></label>
            <label className="field">시간 <small>(선택)</small><input type="time" value={f.time} onChange={set('time')} /></label>
          </div>
        </>
      )}
      {personal ? (
        <p className="muted small">나만 보는 설교입니다. 예배 설교표에는 나타나지 않습니다.</p>
      ) : (
        <>
          <label className="field">설교자
            <select value={f.who} onChange={set('who')}>
              <option value="">아직 정하지 않음</option>
              {staff.map((p) => <option key={p.id} value={p.id}>{p.name} {p.title}</option>)}
              <option value="text">직접 입력 (외부 강사 등)</option>
            </select>
          </label>
          {f.who === 'text' && <label className="field">설교자 이름<input value={f.name} onChange={set('name')} autoFocus /></label>}
        </>
      )}
      <label className="field">본문<input value={f.passage} onChange={set('passage')} placeholder="예: 요한복음 3:16-21" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

const useOpenSermon = () => {
  const { openModal } = useData()
  return (initial) => openModal({ render: (close) => <SermonModal initial={initial} onClose={close} /> })
}

/* ---------- 예배 설교표 ---------- */
export function SermonTable() {
  const { profile } = useAuth()
  const { version } = useData()
  const [week0, setWeek0] = useState(startOfWeek())
  const [rows, setRows] = useState(null)
  const open = useOpenSermon()
  const nameOf = usePreacherName()
  const days = [...Array(7)].map((_, i) => addDays(week0, i))
  const today = ymd(new Date())

  useEffect(() => {
    setRows(null)
    supabase.from('sermons').select('*').eq('is_public', true)
      .gte('date', ymd(week0)).lte('date', ymd(days[6])).order('date').order('time')
      .then(({ data }) => setRows(data ?? []))
  }, [week0.getTime(), version])

  const find = (service, d) => (rows ?? []).find((s) => s.service === service && s.date === ymd(d))
  const specials = (rows ?? []).filter((s) => s.service === 'special')

  const slotRow = (service, d, label) => {
    const s = find(service, d)
    const empty = isEmpty(s)
    return (
      <div key={`${service}-${ymd(d)}`} className="table-row">
        <b className={ymd(d) === today ? 'accent' : ''}>{label}</b>
        {rows === null ? <span className="grow skeleton" />
          : empty ? <span className="grow muted">아직 비어 있음</span>
          : <span className="grow">{nameOf(s) || '설교자 미정'} · {s.passage || '본문 미정'} {s.preacher_id === profile.id && <span className="chip">내 설교</span>}</span>}
        <button type="button" className="link-btn" onClick={() => open(s ?? { service, date: ymd(d) })}>{empty ? '입력' : '수정'}</button>
      </div>
    )
  }

  return (
    <section className="block" id="sermon-table" aria-labelledby="table-h">
      <div className="block-head">
        <h2 id="table-h" className="pill">예배 설교표</h2>
        <div className="month-nav">
          <button type="button" className="icon-btn light" aria-label="이전 주" onClick={() => setWeek0(addDays(week0, -7))}>‹</button>
          <button type="button" className="icon-btn light" aria-label="다음 주" onClick={() => setWeek0(addDays(week0, 7))}>›</button>
        </div>
        <strong className="grow">{md(days[0])} – {md(days[6])}</strong>
      </div>
      <div className="card">
        <div className="grid-2">
          <div className="box">
            <h3>새벽기도회 <small>매일 05:30 · 주일 포함</small></h3>
            {days.map((d) => slotRow('dawn', d, dayLabel(d)))}
          </div>
          <div className="stack">
            <div className="box">
              <h3>수요예배 <small>19:30</small></h3>
              {slotRow('wed', days[3], dayLabel(days[3]))}
            </div>
            <div className="box">
              <h3>금요기도회 <small>20:30</small></h3>
              {slotRow('fri', days[5], dayLabel(days[5]))}
            </div>
            <div className="box">
              <h3>특별 예배 <small>연합속회 등</small></h3>
              {specials.map((s) => (
                <div key={s.id} className="table-row">
                  <b>{dayLabel(toDate(s.date))}</b>
                  <span className="grow"><strong>{s.title}</strong> {hhmm(s.time)}<br />{nameOf(s) || '설교자 미정'} · {s.passage || '본문 미정'} {s.preacher_id === profile.id && <span className="chip">내 설교</span>}</span>
                  <button type="button" className="link-btn" onClick={() => open(s)}>수정</button>
                </div>
              ))}
              {rows !== null && specials.length === 0 && <span className="muted">이번 주에는 특별 예배가 없습니다.</span>}
              <button type="button" className="btn btn-dashed" onClick={() => open({ service: 'special', date: ymd(week0) })}>+ 특별 예배 추가</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- 내 설교 ---------- */
export function MySermons() {
  const { profile } = useAuth()
  const { version } = useData()
  const [rows, setRows] = useState(null)
  const open = useOpenSermon()
  const week0 = startOfWeek()
  const today = new Date(new Date().toDateString())

  useEffect(() => {
    supabase.from('sermons').select('*')
      .or(`preacher_id.eq.${profile.id},and(is_public.eq.false,created_by.eq.${profile.id})`)
      .gte('date', ymd(week0)).lte('date', ymd(addDays(week0, 13))).order('date').order('time')
      .then(({ data }) => setRows(data ?? []))
  }, [version, profile.id])

  // 오늘을 포함해 앞으로 남은 설교 수 (지난 설교는 목록에는 '완료'로 남지만 세지 않는다)
  const upcoming = (rows ?? []).filter((s) => s.date >= ymd(today)).length

  return (
    <section className="block" aria-labelledby="sermon-h">
      <h2 id="sermon-h" className="pill">내 설교</h2>
      <div className="card">
        <div className="card-head">
          <span className="muted">다가오는 설교 · 2주 안</span>
          <span className="count">{upcoming} <small>편</small></span>
        </div>
        {rows === null && <span className="skeleton" />}
        {rows?.length === 0 && <div className="empty">2주 안에 잡힌 설교가 없습니다.</div>}
        {(rows ?? []).map((s) => {
          const d = toDate(s.date)
          const diff = Math.round((d - today) / 86400000)
          const done = diff < 0
          return (
            <div key={s.id} className="sermon-row">
              <span className={`date-badge${done ? ' is-done' : ''}`}><b>{md(d)}</b><span>{d.getDay() === 0 ? '주일' : `${DOW_KO[d.getDay()]}요일`}</span></span>
              <div className="grow">
                <span className="muted small">{hhmm(s.time)} {done ? '· 완료' : <span className="chip">{diff === 0 ? '오늘' : `D-${diff}`}</span>}</span>
                <span className={done ? 'muted' : ''}>{s.title || SERVICES[s.service].name} · {s.passage || '본문 미정'}</span>
              </div>
              <button type="button" className="link-btn" onClick={() => open(s)}>수정</button>
            </div>
          )
        })}
        <button type="button" className="btn btn-dashed" onClick={() => open({ service: 'other', date: ymd(new Date()) })}>+ 설교 추가</button>
        <p className="note push">예배 설교표에 내 이름이 들어가면 여기에 함께 뜹니다. 본문은 어느 쪽에서 고쳐도 같이 바뀝니다.</p>
      </div>
    </section>
  )
}

/* ---------- 예배 설교표 월별 ---------- */
const SHORT = { dawn: '새벽', wed: '수요', fri: '금요' }

export function SermonsMonth() {
  const { profile } = useAuth()
  const { version } = useData()
  const now = new Date()
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const [show, setShow] = useState('all') // all | dawn | wedfri | special | mine
  const [rows, setRows] = useState(null)
  const open = useOpenSermon()
  const nameOf = usePreacherName()
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const today = ymd(now)

  useEffect(() => {
    setRows(null)
    supabase.from('sermons').select('*').eq('is_public', true)
      .gte('date', ymd(month)).lt('date', ymd(next)).order('time')
      .then(({ data }) => setRows(data ?? []))
  }, [month.getTime(), version])

  const cells = []
  for (let i = 0; i < month.getDay(); i++) cells.push(null)
  for (let d = new Date(month); d < next; d = addDays(d, 1)) cells.push(d)
  while (cells.length % 7) cells.push(null)

  const filters = [
    { id: 'all', name: '전체' }, { id: 'dawn', name: '새벽' }, { id: 'wedfri', name: '수요·금요' },
    { id: 'special', name: '특별' }, { id: 'mine', name: '내 설교만' },
  ]
  const wants = (service) => show === 'all' || show === 'mine' || show === service || (show === 'wedfri' && (service === 'wed' || service === 'fri'))
  const mineOnly = show === 'mine'
  const filled = (rows ?? []).filter((s) => !isEmpty(s)).length

  // 날짜 하루에 들어갈 칸: 새벽(매일), 수요(수), 금요(금)는 비어 있어도 자리를 보여주고, 특별 예배는 있는 것만
  function slotsOf(d) {
    const key = ymd(d)
    const list = []
    for (const service of ['dawn', 'wed', 'fri']) {
      if (service === 'wed' && d.getDay() !== 3) continue
      if (service === 'fri' && d.getDay() !== 5) continue
      if (!wants(service)) continue
      const s = (rows ?? []).find((x) => x.service === service && x.date === key)
      list.push({ service, s, initial: s ?? { service, date: key } })
    }
    if (wants('special')) (rows ?? []).filter((x) => x.service === 'special' && x.date === key).forEach((s) => list.push({ service: 'special', s, initial: s }))
    return mineOnly ? list.filter((x) => x.s?.preacher_id === profile.id) : list
  }

  return (
    <>
      <header className="title">
        <h1 className="display page-title">SERMONS</h1>
        <span className="muted">예배 설교표 · 월별</span>
      </header>
      <section className="block" aria-labelledby="smonth-h">
        <div className="block-head">
          <h2 id="smonth-h" className="pill">{month.getFullYear()}년 {month.getMonth() + 1}월</h2>
          <div className="month-nav">
            <button type="button" className="icon-btn light" aria-label="이전 달" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <button type="button" className="icon-btn light" aria-label="다음 달" onClick={() => setMonth(next)}>›</button>
          </div>
          <div className="tabs grow">
            {filters.map((f) => (
              <button key={f.id} type="button" className={`tab${show === f.id ? ' is-on' : ''}`} aria-pressed={show === f.id} onClick={() => setShow(f.id)}>{f.name}</button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => open({ service: 'special', date: ymd(month.getMonth() === now.getMonth() ? now : month) })}>+ 특별 예배</button>
        </div>
        <div className="card scroll-x">
          <div className="month">
            {DOW_KO.map((w) => <span key={w} className="month-dow">{w}</span>)}
            {cells.map((d, i) => (
              <div key={i} className={`month-cell${d === null ? ' is-empty' : ''}${d && ymd(d) === today ? ' is-today' : ''}`}>
                {d && <span className="month-date">{d.getDate()}</span>}
                {d && rows === null && <span className="skeleton" />}
                {d && rows !== null && slotsOf(d).map(({ service, s, initial }, j) => {
                  const empty = isEmpty(s)
                  const mine = s?.preacher_id === profile.id
                  return (
                    <button key={j} type="button" className={`sermon-slot${empty ? ' is-empty' : ''}${mine ? ' is-mine' : ''}`} onClick={() => open(initial)}>
                      <b>{service === 'special' ? s.title : SHORT[service]}</b>
                      {empty ? <span>비어 있음</span> : <span>{nameOf(s) || '설교자 미정'}{s.passage && ` · ${s.passage}`}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="note">이번 달 입력된 설교 {filled}편. 칸을 누르면 설교자와 본문을 입력하거나 고칠 수 있습니다. 진한 초록 칸은 내 설교입니다.</p>
      </section>
    </>
  )
}
