// 예배 설교표(모두 함께)와 내 설교(본인). 같은 표(sermons)의 같은 줄을 보여주므로
// 어느 쪽에서 본문을 고쳐도 양쪽이 함께 바뀐다.
import { useEffect, useState } from 'react'
import { supabase, useAuth, toKorean } from './auth.jsx'
import { useData, useIsPhone, Modal, ymd, addDays, startOfWeek, DOW_KO, TimeSelect, PillLink, ViewSwitch, useView, HomeHead, weekRange } from './live.jsx'

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
const isEmpty = (s) => !s || (!s.preacher_id && !s.preacher_name && !s.passage && !s.host_id && !s.host_name)

// 초하루 새벽기도회: 매달 1일, 1일이 주일이면 2일(월). 그날 새벽 칸을 대신하고 설교는 담임목사님, 사회자를 적는다.
export const isChoharu = (date) => {
  const d = typeof date === 'string' ? toDate(date) : date
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const day = first.getDay() === 0 ? 2 : 1
  return d.getDate() === day
}
const CHO_TIME = '05:30'
const isCho = (s) => s?.service === 'dawn' && isChoharu(s.date)

// 사역자 이름 칸 하나: 목록에서 고르거나(자동 완성) 그냥 적는다. 목록 이름과 같으면 그 사역자로 연결.
const staffLabel = (p) => `${p.name} ${p.title ?? ''}`.trim()
export function PersonInput({ label, value, onChange, placeholder, autoFocus }) {
  const { staff } = useData()
  const id = `pl-${label}`
  return (
    <label className="field">{label}
      <input list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? '이름을 적거나 목록에서 고르기'} autoFocus={autoFocus} autoComplete="off" />
      <datalist id={id}>{staff.map((p) => <option key={p.id} value={staffLabel(p)} />)}</datalist>
    </label>
  )
}
// 적은 글 → { id, name } (사역자와 같으면 id, 아니면 글자 그대로)
const resolvePerson = (staff, text) => {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return { id: null, name: null }
  const p = staff.find((x) => staffLabel(x) === t || x.name === t || `${x.name}${x.title ?? ''}` === t.replace(/ /g, ''))
  return p ? { id: p.id, name: null } : { id: null, name: t }
}
const personText = (staff, id, name) => { const p = id && staff.find((x) => x.id === id); return p ? staffLabel(p) : name ?? '' }

function usePreacherName() {
  const { staff } = useData()
  return (s) => {
    if (isCho(s)) return '담임목사'
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
  const cho = initial.service === 'dawn' && isChoharu(initial.date)
  const [f, setF] = useState({
    title: initial.title ?? '',
    date: initial.date ?? ymd(new Date()),
    time: hhmm(initial.time) || (cho ? CHO_TIME : SERVICES[initial.service].time),
    who: personText(staff, initial.preacher_id, initial.preacher_name),
    host: personText(staff, initial.host_id, initial.host_name),
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
    const who = personal ? { id: profile.id, name: null } : resolvePerson(staff, f.who)
    const host = resolvePerson(staff, f.host)
    const head = staff.find((x) => x.rank === '담임목사')
    const row = {
      service: initial.service,
      title: slot ? null : f.title.trim(),
      date: f.date,
      time: f.time || null,
      // 초하루는 설교자가 담임목사님으로 정해져 있다 (계정이 없으면 글자로)
      preacher_id: cho ? head?.id ?? null : who.id,
      preacher_name: cho ? (head ? null : '담임목사') : who.name,
      host_id: cho ? host.id : null,
      host_name: cho ? host.name : null,
      passage: f.passage.trim() || null,
      is_public: !personal,
    }
    run(editing ? supabase.from('sermons').update(row).eq('id', initial.id) : supabase.from('sermons').insert(row), '설교를 저장했습니다.')
  }
  // 정해진 칸(새벽·수요·금요)은 내용만 비우고, 특별 예배와 내 설교는 줄을 지운다
  const clear = () => run(
    slot
      ? supabase.from('sermons').update({ preacher_id: null, preacher_name: null, passage: null, host_id: null, host_name: null }).eq('id', initial.id)
      : supabase.from('sermons').delete().eq('id', initial.id),
    slot ? '칸을 비웠습니다.' : '설교를 지웠습니다.',
  )

  const d = toDate(f.date)
  return (
    <Modal title={cho ? '초하루 새벽기도회' : slot ? SERVICES[initial.service].name : personal ? '내 설교' : '특별 예배'} onClose={onClose} onSubmit={save}
      footer={<>
        {editing && <button type="button" className="btn btn-danger" onClick={clear} disabled={busy}>{slot ? '비우기' : '삭제'}</button>}
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </>}>
      {slot ? (
        <p><strong>{d.getMonth() + 1}월 {d.getDate()}일 ({DOW_KO[d.getDay()]}) {cho ? CHO_TIME : f.time}</strong></p>
      ) : (
        <>
          <label className="field">예배 이름<input value={f.title} onChange={set('title')} placeholder={personal ? '예: 유년부 예배' : '예: 연합속회'} autoFocus /></label>
          <div className="field-row">
            <label className="field">날짜<input type="date" value={f.date} onChange={set('date')} required /></label>
            <label className="field"><span>시간 <small>(선택)</small></span><TimeSelect optional label="시간" value={f.time} onChange={(v) => setF({ ...f, time: v })} /></label>
          </div>
        </>
      )}
      {personal ? (
        <p className="muted small">나만 보는 설교입니다. 예배 설교표에는 나타나지 않습니다.</p>
      ) : cho ? (
        <>
          <p className="field-static"><span>설교</span><b>담임목사</b></p>
          <PersonInput label="사회자" value={f.host} onChange={(v) => setF({ ...f, host: v })} />
        </>
      ) : (
        <PersonInput label="설교자" value={f.who} onChange={(v) => setF({ ...f, who: v })} />
      )}
      <label className="field">본문<input value={f.passage} onChange={set('passage')} placeholder="예: 요한복음 3:16-21" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

export const useOpenSermon = () => {
  const { openModal } = useData()
  return (initial) => openModal({ render: (close) => <SermonModal initial={initial} onClose={close} /> })
}

/* ---------- 예배 설교표 ---------- */
export function SermonTable({ inPage }) {
  const { profile } = useAuth()
  const { version, staff } = useData()
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
          : empty && service === 'dawn' && isChoharu(d) ? <span className="grow"><span className="chip chip-cho">초하루</span> 담임목사 · 본문 미정 · 사회 미정</span>
          : empty ? <span className="grow muted">아직 비어 있음</span>
          : <span className="grow">{isCho(s) && <span className="chip chip-cho">초하루</span>} {nameOf(s) || '설교자 미정'} · {s.passage || '본문 미정'}{isCho(s) && ` · 사회 ${personText(staff, s.host_id, s.host_name) || '미정'}`} {s.preacher_id === profile.id && <span className="chip">내 설교</span>}</span>}
        <button type="button" className="link-btn" onClick={() => open(s ?? { service, date: ymd(d) })}>{empty ? '입력' : '수정'}</button>
      </div>
    )
  }

  const grid = (
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
  )
  if (!inPage) {
    return (
      <section className="hc" id="sermon-table" aria-labelledby="table-h">
        <HomeHead id="table-h" title="예배 설교표" href="#sermons" range={weekRange(week0)} week0={week0} setWeek0={setWeek0}>
          <a href="#sermons" className="hc-more">예배 설교표 →</a>
        </HomeHead>
        {grid}
      </section>
    )
  }
  return (
    <section className="block" id="sermon-table" aria-labelledby="table-h">
      <div className="block-head">
        <PillLink id="table-h" href="#sermons" inPage={inPage}>주별</PillLink>
        <div className="month-nav">
          <button type="button" className="icon-btn light" aria-label="이전 주" onClick={() => setWeek0(addDays(week0, -7))}>‹</button>
          <button type="button" className="icon-btn light" aria-label="다음 주" onClick={() => setWeek0(addDays(week0, 7))}>›</button>
        </div>
        <strong className="grow">{md(days[0])} – {md(days[6])}</strong>
      </div>
      <div className="card">{grid}</div>
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
      .then(({ data }) => setRows((data ?? []).filter((s) => s.date >= ymd(new Date())))) // 지난 설교는 홈에 보이지 않는다
  }, [version, profile.id])

  // 오늘을 포함해 앞으로 남은 설교 수 (지난 설교는 목록에는 '완료'로 남지만 세지 않는다)
  const upcoming = (rows ?? []).filter((s) => s.date >= ymd(today)).length

  return (
    <section className="hc" aria-labelledby="sermon-h">
      <HomeHead id="sermon-h" title={<>내 설교 <span className="hc-sub">다가오는 설교</span> <span className="hc-count">{rows === null ? '' : upcoming}</span></>}>
        <a href="#sermons" className="hc-more">예배 설교표 →</a>
      </HomeHead>
      {rows === null && <span className="skeleton" />}
      {rows?.length === 0 && <div className="empty">2주 안에 잡힌 설교가 없습니다.</div>}
      <div className="hc-list">
        {(rows ?? []).map((s) => {
          const d = toDate(s.date)
          const diff = Math.round((d - today) / 86400000)
          const done = diff < 0
          const hasText = Boolean(s.passage)
          return (
            <div key={s.id} className={`hc-row${done ? ' is-past' : ''}`}>
              <span className={`hc-date${diff === 0 || (diff > 0 && s === rows.find((x) => x.date >= ymd(today))) ? ' is-next' : ''}`}><b>{d.getDate()}</b><span>{DOW_KO[d.getDay()]}</span></span>
              <span className="hc-text">
                <b>{s.title || SERVICES[s.service].name}{s.passage ? ` · ${s.passage}` : ''}</b>
                <span>{md(d)} {hhmm(s.time)}{done ? ' · 지남' : diff === 0 ? ' · 오늘' : ` · D-${diff}`}</span>
              </span>
              <span className="hc-end">
                {!done && <span className={`hc-chip${hasText ? '' : ' is-warn'}`}>{hasText ? '본문 있음' : '본문 없음'}</span>}
                <button type="button" className="hc-edit" onClick={() => open(s)}>{hasText || done ? '수정' : '본문 쓰기'}</button>
              </span>
            </div>
          )
        })}
      </div>
      <button type="button" className="hc-add" onClick={() => open({ service: 'other', date: ymd(new Date()) })}>+ 내 설교 추가</button>
    </section>
  )
}

/* ---------- 휴대폰: 새벽 필터를 고르면 한 달 새벽기도를 목록으로 ---------- */
function DawnList({ month, next, rows, today, open, staff, nameOf }) {
  const days = []
  for (let d = new Date(month); d < next; d = addDays(d, 1)) days.push(d)
  const plain = (n) => n.replace(/\s+(목사|전도사|강도사)(님)?$/, '')
  return (
    <div className="card dawn-list">
      <h3 className="sub-h">{month.getMonth() + 1}월 새벽기도회</h3>
      {rows === null ? <span className="skeleton" /> : (
        <ul>
          {days.map((d) => {
            const key = ymd(d)
            const s = rows.find((x) => x.service === 'dawn' && x.date === key)
            const cho = isChoharu(d)
            const who = cho ? '담임목사' : s ? plain(nameOf(s)) : ''
            return (
              <li key={key} className={`${key === today ? 'is-today' : ''}${key < today ? ' is-past' : ''}${cho ? ' is-cho' : ''}`}>
                <button type="button" onClick={() => open(s ?? { service: 'dawn', date: key })}>
                  <span className="dl-date">{d.getDate()} <small>({DOW_KO[d.getDay()]})</small></span>
                  <span className="dl-who">{cho && <b className="dl-cho">초하루</b>}{who || <i>미정</i>}</span>
                  <span className="dl-psg">{s?.passage || ''}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/* ---------- 예배 설교표 월별 ---------- */
const SHORT = { dawn: '새벽', wed: '수요', fri: '금요' }
// 예배마다 색 (설교표 월별 칸·범례)
const SVC_LEGEND = [['dawn', '새벽'], ['cho', '초하루'], ['wed', '수요'], ['fri', '금요'], ['special', '특별']]
// "이현범 목사" → 이름과 직분을 나눠, 휴대폰 달력 칸에서는 이름만 한 줄로
const splitTitle = (n) => { const m = n.match(/^(.*\S)\s+(목사|전도사|강도사|장로|권사|집사|사모|선교사)(님)?$/); return m ? <>{m[1]}<i className="ttl"> {m[2]}</i></> : n }

export function SermonsMonth() {
  const { profile } = useAuth()
  const { version, staff } = useData()
  const phone = useIsPhone()
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
  const [view, setView] = useView('sermons')

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
        <h1 className="display page-title">SERMONS<span className="page-ko">예배 설교표</span></h1>
        <ViewSwitch value={view} onChange={setView} />
      </header>
      {view === 'week' ? <SermonTable inPage /> : <section className="block" aria-labelledby="smonth-h">
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
        <div className="svc-legend" aria-label="예배 색">{SVC_LEGEND.map(([k, v]) => <span key={k} className={`sermon-slot svc-${k} legend`}>{v}</span>)}</div>
        {phone && show === 'dawn' ? <DawnList month={month} next={next} rows={rows} today={today} open={open} staff={staff} nameOf={nameOf} /> : <div className="card scroll-x">
          <div className="month month-grid-always">
            {DOW_KO.map((w) => <span key={w} className="month-dow">{w}</span>)}
            {cells.map((d, i) => (
              <div key={i} className={`month-cell${d === null ? ' is-empty' : ''}${d && ymd(d) === today ? ' is-today' : ''}`}>
                {d && <span className="month-date" data-dow={DOW_KO[d.getDay()]}>{d.getDate()}</span>}
                {d && rows === null && <span className="skeleton" />}
                {d && rows !== null && slotsOf(d).map(({ service, s, initial }, j) => {
                  const empty = isEmpty(s)
                  if (service === 'dawn' && isChoharu(d)) {
                    // 초하루: 설교는 담임목사님, 칸에는 사회자를 보여 준다
                    const host = s ? personText(staff, s.host_id, s.host_name) : ''
                    return (
                      <button key={j} type="button" className="sermon-slot svc-cho" onClick={() => open(initial)}>
                        <b>초하루</b>
                        <span>{host ? <><i className="lbl">사회 </i>{splitTitle(host)}</> : <><i className="lbl">사회 </i>미정</>}{s?.passage && <small className="psg">{s.passage}</small>}</span>
                      </button>
                    )
                  }
                  return (
                    <button key={j} type="button" className={`sermon-slot svc-${service}${empty ? ' is-empty' : ''}`} onClick={() => open(initial)}>
                      {service === 'special' && <b>{s.title}</b>}
                      {empty ? <span>비어 있음</span> : <span>{splitTitle(nameOf(s) || '미정')}{s.passage && <small className="psg">{s.passage}</small>}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>}
      </section>}
    </>
  )
}
