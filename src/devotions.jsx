// 아침경건회: 날짜마다 순서(맡은 사람)를 적는다. 누구나 입력·수정할 수 있다.
// 본문은 따로 적지 않고 그날 새벽기도회(설교표 dawn) 본문을 그대로 보여준다.
// 또 "내 설교"와 "내 경건회 순서"를 교회 캘린더의 개인 일정처럼 보여주는 useMyDuties 도 여기 있다.
import { useEffect, useState } from 'react'
import { supabase, useAuth, toKorean } from './auth.jsx'
import { useData, Modal, ymd, addDays, startOfWeek, sameDay, DOW_KO, ViewSwitch, useView, useIsPhone, weekRange } from './live.jsx'
import { SERVICES, useOpenSermon } from './sermons.jsx'

const toDate = (s) => new Date(`${s}T00:00`)
const kDate = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW_KO[d.getDay()]})`
// 경건회 칸을 보여줄 요일 (일요일 제외)
const DAYS = [1, 2, 3, 4, 5, 6]

function useLeaderName() {
  const { staff } = useData()
  return (v) => {
    if (!v) return ''
    if (v.leader_id) { const p = staff.find((x) => x.id === v.leader_id); return p ? `${p.name} ${p.title}` : '(알 수 없는 사역자)' }
    return v.leader_name || ''
  }
}

// 기간 안의 경건회 순서와 새벽 본문 불러오기
function useDevotions(from, to) {
  const { version } = useData()
  const [data, setData] = useState(null) // { dev: {날짜: 줄}, dawn: {날짜: 본문} }
  useEffect(() => {
    setData(null)
    Promise.all([
      supabase.from('devotions').select('*').gte('date', ymd(from)).lt('date', ymd(to)),
      supabase.from('sermons').select('date, passage').eq('service', 'dawn').eq('is_public', true).gte('date', ymd(from)).lt('date', ymd(to)),
    ]).then(([a, b]) => setData({
      dev: Object.fromEntries((a.data ?? []).map((x) => [x.date, x])),
      dawn: Object.fromEntries((b.data ?? []).filter((x) => x.passage).map((x) => [x.date, x.passage])),
    }))
  }, [from.getTime(), to.getTime(), version])
  return data
}

/* ---------- 입력 창 ---------- */
function DevotionModal({ date, onClose }) {
  const { staff, refresh, notify } = useData()
  const [row, setRow] = useState(undefined) // undefined = 불러오는 중, null = 아직 없음
  const [passage, setPassage] = useState(null)
  const [f, setF] = useState({ who: '', name: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('devotions').select('*').eq('date', date).maybeSingle().then(({ data }) => {
      setRow(data ?? null)
      if (data) setF({ who: data.leader_id ?? (data.leader_name ? 'text' : ''), name: data.leader_name ?? '' })
    })
    supabase.from('sermons').select('passage').eq('service', 'dawn').eq('is_public', true).eq('date', date).maybeSingle()
      .then(({ data }) => setPassage(data?.passage || ''))
  }, [date])

  async function run(action, done) {
    setBusy(true)
    const { error } = await action
    setBusy(false)
    if (error) return setError(error.code === '23505' ? '방금 다른 분이 이 날을 먼저 입력했습니다. 닫고 다시 열어 주세요.' : toKorean(error.message))
    refresh(); notify(done); onClose()
  }
  function save(e) {
    e.preventDefault()
    if (!f.who) return setError('맡은 사람을 골라 주세요.')
    if (f.who === 'text' && !f.name.trim()) return setError('이름을 적어 주세요.')
    const fields = {
      leader_id: f.who !== 'text' ? f.who : null,
      leader_name: f.who === 'text' ? f.name.trim() : null,
    }
    run(row ? supabase.from('devotions').update(fields).eq('date', date) : supabase.from('devotions').insert({ date, ...fields }), '경건회 순서를 저장했습니다.')
  }
  const clear = () => run(supabase.from('devotions').delete().eq('date', date), '경건회 순서를 비웠습니다.')

  return (
    <Modal title="아침경건회" onClose={onClose} onSubmit={save}
      footer={<>
        {row && <button type="button" className="btn btn-danger" onClick={clear} disabled={busy}>비우기</button>}
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={busy || row === undefined}>{busy ? '저장 중…' : '저장'}</button>
      </>}>
      <p><strong>{kDate(toDate(date))}</strong></p>
      <label className="field">맡은 사람
        <select value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} disabled={row === undefined}>
          <option value="">선택</option>
          {staff.map((p) => <option key={p.id} value={p.id}>{p.name} {p.title}</option>)}
          <option value="text">직접 입력</option>
        </select>
      </label>
      {f.who === 'text' && <label className="field">이름<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></label>}
      <div className="field">
        <span>본문 <small>(그날 새벽기도회 본문)</small></span>
        <p className="dev-passage">{passage === null ? '불러오는 중…' : passage || '새벽 본문이 아직 없습니다. 예배 설교표에 새벽 본문을 넣으면 여기에 자동으로 나옵니다.'}</p>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

export const useOpenDevotion = () => {
  const { openModal } = useData()
  return (date) => openModal({ render: (close) => <DevotionModal date={date} onClose={close} /> })
}

/* ---------- 교회 캘린더의 "개인" 칸에 보일 내 설교·내 경건회 순서 ---------- */
// 일정(events)처럼 생긴 줄로 바꿔 돌려준다. 누르면 일정 창 대신 설교 창 / 경건회 창이 열린다 (open).
export function useMyDuties(from, to) {
  const { profile } = useAuth()
  const { version } = useData()
  const openSermon = useOpenSermon()
  const openDevotion = useOpenDevotion()
  const [rows, setRows] = useState(null)
  useEffect(() => {
    setRows(null)
    const a = ymd(from), b = ymd(addDays(to, -1))
    Promise.all([
      supabase.from('sermons').select('*')
        .or(`preacher_id.eq.${profile.id},and(is_public.eq.false,created_by.eq.${profile.id})`)
        .gte('date', a).lte('date', b),
      supabase.from('devotions').select('*').eq('leader_id', profile.id).gte('date', a).lte('date', b),
    ]).then(([s, d]) => setRows({ s: s.data ?? [], d: d.data ?? [] }))
  }, [from.getTime(), to.getTime(), version, profile.id])
  if (!rows) return null
  return [
    ...rows.s.map((s) => ({
      id: `sermon-${s.id}`, duty: 'sermon', dept_id: 'personal', all_day: false, no_time: !s.time, ends_at: null,
      starts_at: new Date(`${s.date}T${s.time || '00:00'}`).toISOString(),
      title: `${s.title || SERVICES[s.service].name} 설교${s.passage ? ` · ${s.passage}` : ''}`,
      open: () => openSermon(s),
    })),
    ...rows.d.map((v) => ({
      id: `dev-${v.date}`, duty: 'devotion', dept_id: 'personal', all_day: false, no_time: true, ends_at: null,
      starts_at: new Date(`${v.date}T00:00`).toISOString(),
      title: '아침경건회 순서',
      open: () => openDevotion(v.date),
    })),
  ]
}

/* ---------- 아침경건회 페이지 ---------- */
function WeekList() {
  const { profile } = useAuth()
  const [week0, setWeek0] = useState(startOfWeek())
  const data = useDevotions(week0, addDays(week0, 7))
  const open = useOpenDevotion()
  const nameOf = useLeaderName()
  const today = new Date()
  const days = DAYS.map((i) => addDays(week0, i))
  return (
    <section className="block" aria-labelledby="dweek-h">
      <div className="block-head">
        <h2 id="dweek-h" className="sr-only">주별</h2>
        <div className="month-nav">
          <button type="button" className="icon-btn light" aria-label="이전 주" onClick={() => setWeek0(addDays(week0, -7))}>‹</button>
          <button type="button" className="icon-btn light" aria-label="다음 주" onClick={() => setWeek0(addDays(week0, 7))}>›</button>
        </div>
        <strong className="grow">{weekRange(week0)}</strong>
      </div>
      <div className="card">
        <div className="box">
          {days.map((d) => {
            const v = data?.dev[ymd(d)]
            const passage = data?.dawn[ymd(d)]
            return (
              <div key={ymd(d)} className="table-row">
                <b className={sameDay(d, today) ? 'accent' : ''}>{DOW_KO[d.getDay()]} {d.getDate()}</b>
                {data === null ? <span className="grow skeleton" />
                  : <span className="grow">{v ? nameOf(v) : <span className="muted">아직 비어 있음</span>} · {passage || <span className="muted">새벽 본문 없음</span>}
                    {v?.leader_id === profile.id && <> <span className="chip">내 순서</span></>}</span>}
                <button type="button" className="link-btn" onClick={() => open(ymd(d))}>{v ? '수정' : '입력'}</button>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function DevotionsPage() {
  const { profile } = useAuth()
  const now = new Date()
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const data = useDevotions(month, next)
  const open = useOpenDevotion()
  const nameOf = useLeaderName()
  const { staff } = useData()
  // 휴대폰 달력 칸에서는 직분을 숨기고 이름만
  const cellName = (v) => { const p = v.leader_id && staff.find((x) => x.id === v.leader_id); return p ? <>{p.name}<i className="ttl"> {p.title}</i></> : nameOf(v) }
  const [view, setView] = useView('devotions')
  const phone = useIsPhone()
  const [pick, setPick] = useState(null)
  const picked = pick ?? (month.getMonth() === now.getMonth() && month.getFullYear() === now.getFullYear() ? now : month)

  const cells = []
  for (let i = 0; i < month.getDay(); i++) cells.push(null)
  for (let d = new Date(month); d < next; d = addDays(d, 1)) cells.push(d)
  while (cells.length % 7) cells.push(null)
  const pv = data?.dev[ymd(picked)]

  return (
    <>
      <header className="title">
        <h1 className="display page-title">DEVOTION</h1>
        <span className="muted">아침경건회 · 본문은 그날 새벽기도회 본문</span>
        <ViewSwitch value={view} onChange={setView} />
      </header>
      {view === 'week' ? <WeekList /> : <section className="block" aria-labelledby="dmonth-h">
        <div className="block-head">
          <h2 id="dmonth-h" className="pill">{month.getFullYear()}년 {month.getMonth() + 1}월</h2>
          <div className="month-nav">
            <button type="button" className="icon-btn light" aria-label="이전 달" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <button type="button" className="icon-btn light" aria-label="다음 달" onClick={() => setMonth(next)}>›</button>
          </div>
        </div>
        <div className="card scroll-x">
          <div className="month month-grid-always">
            {DOW_KO.map((w) => <span key={w} className="month-dow">{w}</span>)}
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="month-cell is-empty" />
              const key = ymd(d)
              const v = data?.dev[key]
              const passage = data?.dawn[key]
              const on = DAYS.includes(d.getDay()) || v
              return (
                <div key={i} className={`month-cell${sameDay(d, now) ? ' is-today' : ''}${phone && sameDay(d, picked) ? ' is-picked' : ''}`}
                  onClick={phone ? () => setPick(d) : undefined}>
                  <span className="month-date" data-dow={DOW_KO[d.getDay()]}>{d.getDate()}</span>
                  {data === null && <span className="skeleton" />}
                  {data !== null && on && (
                    <button type="button" className={`sermon-slot svc-dev${v ? '' : ' is-empty'}${v?.leader_id === profile.id ? ' is-mine' : ''}`}
                      onClick={(e) => { if (phone) { e.stopPropagation(); setPick(d) } else open(key) }}>
                      {v ? <span>{cellName(v)}{passage && <small> · {passage}</small>}</span> : <span>비어 있음</span>}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        {phone && data !== null && (
          <div className="hc day-panel">
            <div className="hc-head">
              <h2 className="hc-title">{kDate(picked)}</h2>
              <span className="hc-right"><button type="button" className="hc-btn is-green" onClick={() => open(ymd(picked))}>{pv ? '수정' : '+ 순서 입력'}</button></span>
            </div>
            <p className="small"><b>맡은 사람</b> {pv ? nameOf(pv) : <span className="muted">아직 비어 있음</span>}</p>
            <p className="small"><b>본문</b> {data.dawn[ymd(picked)] || <span className="muted">새벽 본문 없음</span>}</p>
          </div>
        )}
      </section>}
    </>
  )
}
