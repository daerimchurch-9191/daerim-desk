// 주일예배 출석현황 (2026-11-26)
// 주일마다 칸별 인원: 장년(1·2·3부, 청년=4부), 교육(유아·유치·유년·초등·청소년). 승인된 사역자 누구나 입력·수정.
// 옛 종이 기록은 교육 부서별 숫자가 없어 'edu'(교육 합계) 한 칸으로 들어 있다. 부서 칸이 하나라도 있으면 부서 합을 쓴다.
// 보기: 주일별 / 월별(주일마다 한 줄 + 평균) / 연별(달마다 평균) / 분석(평균 카드·추이 그래프·부서별 비교·작년 같은 달 비교)
import { useEffect, useMemo, useState } from 'react'
import { supabase, toKorean } from './auth.jsx'
import { useData, Modal, ymd, addDays, startOfWeek } from './live.jsx'

export const ADULT = [['p1', '1부'], ['p2', '2부'], ['p3', '3부'], ['youth', '청년']]
export const EDU = [['infant', '유아'], ['kinder', '유치'], ['child', '유년'], ['elem', '초등'], ['teen', '청소년']]
const ALL_SLOTS = [...ADULT, ...EDU]

const fmt = (n) => (n == null ? '–' : Math.round(n).toLocaleString('ko-KR'))
const toDate = (s) => new Date(`${s}T00:00`)
const lastSunday = () => startOfWeek(new Date()) // 오늘이 주일이면 오늘, 아니면 지난 주일
const sum = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null }
const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }

// 한 주일 계산: 칸별 값 + 1~3부 합, 장년 합(1~3부+청년), 교육 합, 총합
// 합은 그 칸들이 모두 입력됐을 때만 낸다 (덜 들어온 주일이 평균·그래프를 끌어내리지 않게).
// loose=true 이면 들어온 것만 더한다 (입력 창에서 쓰는 중간 합계).
const all = (xs) => (xs.every((x) => x != null) ? xs.reduce((a, b) => a + b, 0) : null)
export function weekStats(w, loose = false) {
  if (!w) return null
  const v = (k) => (w[k] ?? null)
  const add = loose ? sum : all
  const depts = EDU.map(([k]) => v(k))
  const anyDept = depts.some((x) => x != null)
  const edu = anyDept ? add(depts) : v('edu')
  const main = add([v('p1'), v('p2'), v('p3')])
  const adult = add([main, v('youth')])
  return { ...w, main, adult, edu, eduLegacy: !anyDept && v('edu') != null, total: add([adult, edu]) }
}

// 기간 안의 출석 불러오기 → { 'YYYY-MM-DD': { p1: 150, ..., _by, _at } }
function useAttendance(from, to) {
  const { version } = useData()
  const [data, setData] = useState(null)
  useEffect(() => {
    setData(null)
    supabase.from('attendance').select('*').gte('sunday', ymd(from)).lt('sunday', ymd(to)).order('sunday')
      .then(({ data: rows }) => {
        const m = {}
        for (const r of rows ?? []) {
          const w = (m[r.sunday] ??= {})
          w[r.slot] = r.count
          if (!w._at || r.updated_at > w._at) { w._at = r.updated_at; w._by = r.updated_by }
        }
        setData(m)
      })
  }, [from.getTime(), to.getTime(), version])
  return data
}
const sundaysBetween = (from, to) => { const out = []; for (let d = startOfWeek(addDays(from, 6)); d < to; d = addDays(d, 7)) out.push(d); return out }

/* ---------- 인원 입력 창 ---------- */
function AttModal({ sunday, onClose }) {
  const { refresh, notify } = useData()
  const [day, setDay] = useState(sunday ?? ymd(lastSunday()))
  const [old, setOld] = useState(null) // 저장된 값
  const [f, setF] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const base = lastSunday()
  const days = [...Array(9)].map((_, i) => ymd(addDays(base, (1 - i) * 7)))
  if (!days.includes(day)) days.push(day)

  useEffect(() => {
    setOld(null)
    supabase.from('attendance').select('slot, count').eq('sunday', day).then(({ data }) => {
      const o = Object.fromEntries((data ?? []).map((r) => [r.slot, r.count]))
      setOld(o); setF(Object.fromEntries(ALL_SLOTS.map(([k]) => [k, o[k] != null ? String(o[k]) : ''])))
    })
  }, [day])

  const num = (k) => (f[k] === '' || f[k] == null ? null : Number(f[k]))
  const live = weekStats({ ...Object.fromEntries(ALL_SLOTS.map(([k]) => [k, num(k)])), edu: old?.edu ?? null }, true)

  async function save(e) {
    e.preventDefault()
    if (ALL_SLOTS.some(([k]) => f[k] !== '' && !/^\d{1,5}$/.test(f[k]))) return setError('인원은 숫자로만 적어 주세요.')
    const up = ALL_SLOTS.filter(([k]) => f[k] !== '' && Number(f[k]) !== old[k]).map(([k]) => ({ sunday: day, slot: k, count: Number(f[k]) }))
    const del = ALL_SLOTS.filter(([k]) => f[k] === '' && old[k] != null).map(([k]) => k)
    if (!up.length && !del.length) return onClose()
    setBusy(true)
    const r1 = up.length ? await supabase.from('attendance').upsert(up, { onConflict: 'sunday,slot' }) : {}
    const r2 = !r1.error && del.length ? await supabase.from('attendance').delete().eq('sunday', day).in('slot', del) : {}
    setBusy(false)
    const err = r1.error || r2.error
    if (err) return setError(toKorean(err.message))
    refresh(); notify('출석 인원을 저장했습니다.'); onClose()
  }

  const field = ([k, name]) => (
    <label key={k} className="att-in">
      <span>{name}</span>
      <input inputMode="numeric" pattern="[0-9]*" value={f[k] ?? ''} disabled={old === null}
        onChange={(e) => { setF({ ...f, [k]: e.target.value.replace(/[^0-9]/g, '') }); setError('') }} />
    </label>
  )
  return (
    <Modal title="출석 보고" onClose={onClose} onSubmit={save}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={busy || old === null}>{busy ? '저장 중…' : '저장'}</button>
      </>}>
      <label className="field">주일
        <select value={day} onChange={(e) => setDay(e.target.value)}>
          {days.map((d) => { const x = toDate(d); return <option key={d} value={d}>{x.getFullYear()}년 {x.getMonth() + 1}월 {x.getDate()}일</option> })}
        </select>
      </label>
      <fieldset className="att-group">
        <legend>장년 <b>{fmt(live?.adult)}</b></legend>
        <div className="att-grid">{ADULT.map(field)}</div>
      </fieldset>
      <fieldset className="att-group">
        <legend>교육 <b>{fmt(live?.edu)}</b>{live?.eduLegacy && <small> (옛 기록: 교육 합계만)</small>}</legend>
        <div className="att-grid">{EDU.map(field)}</div>
      </fieldset>
      <p className="att-total">총합 <b>{fmt(live?.total)}</b></p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

export const useOpenAttendance = () => {
  const { openModal } = useData()
  return (sunday) => openModal({ render: (close) => <AttModal sunday={sunday} onClose={close} /> })
}

/* ---------- 주일별 ---------- */
function WeekView() {
  const { staff } = useData()
  const [sun, setSun] = useState(lastSunday())
  const data = useAttendance(sun, addDays(sun, 1))
  const open = useOpenAttendance()
  const s = data ? weekStats(data[ymd(sun)] ?? {}) : null
  const filled = s ? ALL_SLOTS.filter(([k]) => s[k] != null).length : 0
  const by = s?._by && staff.find((p) => p.id === s._by)
  // 스케치 모양: 왼쪽 예배(1~4부) + 장년, 오른쪽 교육부(다섯 부서) + 교육 합, 아래 합계
  const line = ([k, name]) => <div key={k} className="att-line"><span>{name}</span><b>{fmt(s?.[k])}</b><em>명</em></div>
  return (
    <section className="block">
      <div className="block-head">
        <div className="month-nav">
          <button type="button" className="icon-btn light" aria-label="이전 주일" onClick={() => setSun(addDays(sun, -7))}>‹</button>
          <button type="button" className="icon-btn light" aria-label="다음 주일" onClick={() => setSun(addDays(sun, 7))}>›</button>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => open(ymd(sun))}>{filled ? '인원 고치기' : '+ 인원 입력'}</button>
      </div>
      <div className="card att-sheet">
        <h2 className="att-sheet-title">{sun.getMonth() + 1}월 {sun.getDate()}일 주일예배 출석현황</h2>
        {s === null ? <span className="skeleton" /> : <>
          <div className="att-cols">
            <div className="att-col">
              <h3>예배</h3>
              {[['p1', '1부'], ['p2', '2부'], ['p3', '3부'], ['youth', '4부']].map(line)}
              <div className="att-line is-sub"><span>장년</span><b>{fmt(s.adult)}</b><em>명</em></div>
            </div>
            <div className="att-col">
              <h3>교육부</h3>
              {EDU.map(line)}
              <div className="att-line is-sub"><span>교육</span><b>{fmt(s.edu)}</b><em>명</em></div>
            </div>
          </div>
          <div className="att-line is-total"><span>합계</span><b>{fmt(s.total)}</b><em>명</em></div>
          {(s.total == null || by) && <p className="small muted">{[s.total == null && `${filled}/9칸 입력`, by && `마지막 입력 ${by.name} ${by.title}`].filter(Boolean).join(' · ')}</p>}
        </>}
      </div>
    </section>
  )
}

/* ---------- 월별 (주일마다 한 줄) ---------- */
function MonthView({ start }) {
  const now = new Date()
  const [m, setM] = useState(start ?? new Date(now.getFullYear(), now.getMonth(), 1))
  const next = new Date(m.getFullYear(), m.getMonth() + 1, 1)
  const data = useAttendance(m, next)
  const open = useOpenAttendance()
  const weeks = sundaysBetween(m, next).map((d) => ({ d, s: weekStats(data?.[ymd(d)] ?? {}) }))
  const has = weeks.filter((w) => w.s.total != null)
  const cols = [...ADULT, ['adult', '장년 합'], ...EDU, ['edu', '교육 합'], ['total', '합계']]
  const sumCol = (k) => k === 'adult' || k === 'edu' || k === 'total'
  return (
    <section className="block">
      <div className="block-head">
        <h2 className="pill">{m.getFullYear()}년 {m.getMonth() + 1}월</h2>
        <div className="month-nav">
          <button type="button" className="icon-btn light" aria-label="이전 달" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))}>‹</button>
          <button type="button" className="icon-btn light" aria-label="다음 달" onClick={() => setM(next)}>›</button>
        </div>
      </div>
      <div className="card scroll-x">
        <table className="att-table">
          <thead><tr><th>주일</th>{cols.map(([k, n]) => <th key={k} className={sumCol(k) ? 'is-sum' : ''}>{n}</th>)}</tr></thead>
          <tbody>
            {data === null ? <tr><td colSpan={cols.length + 1}><span className="skeleton" /></td></tr> : weeks.map(({ d, s }) => (
              <tr key={ymd(d)} className="is-click" onClick={() => open(ymd(d))} title="눌러서 입력·고치기">
                <th>{d.getMonth() + 1}/{d.getDate()}</th>
                {cols.map(([k]) => <td key={k} className={sumCol(k) ? 'is-sum' : ''}>{k === 'edu' && s.eduLegacy ? <span title="옛 기록: 교육 합계만">{fmt(s.edu)}*</span> : fmt(s[k])}</td>)}
              </tr>
            ))}
          </tbody>
          {has.length > 0 && <tfoot><tr><th>평균</th>{cols.map(([k]) => <td key={k} className={sumCol(k) ? 'is-sum' : ''}>{fmt(avg(has.map((w) => w.s[k])))}</td>)}</tr></tfoot>}
        </table>
      </div>
    </section>
  )
}

/* ---------- 연별 (달마다 평균) ---------- */
function useYear(year) {
  const from = useMemo(() => new Date(year, 0, 1), [year]), to = useMemo(() => new Date(year + 1, 0, 1), [year])
  const data = useAttendance(from, to)
  return useMemo(() => {
    if (!data) return null
    return sundaysBetween(from, to).map((d) => ({ d, s: weekStats(data[ymd(d)] ?? {}) })).filter((w) => w.s.total != null)
  }, [data])
}
const monthAvgs = (weeks) => [...Array(12)].map((_, i) => {
  const ws = (weeks ?? []).filter((w) => w.d.getMonth() === i)
  const a = (k) => avg(ws.map((w) => w.s[k]))
  return { month: i, n: ws.length, main: a('main'), youth: a('youth'), adult: a('adult'), edu: a('edu'), total: a('total') }
})
const YEAR_COLS = [['main', '1~3부'], ['youth', '청년'], ['adult', '장년 합'], ['edu', '교육'], ['total', '합계']]

function YearView({ onPickMonth }) {
  const [year, setYear] = useState(new Date().getFullYear())
  const weeks = useYear(year)
  const months = monthAvgs(weeks)
  return (
    <section className="block">
      <div className="block-head">
        <h2 className="pill">{year}년 · 주일 평균</h2>
        <div className="month-nav">
          <button type="button" className="icon-btn light" aria-label="이전 해" onClick={() => setYear(year - 1)}>‹</button>
          <button type="button" className="icon-btn light" aria-label="다음 해" onClick={() => setYear(year + 1)}>›</button>
        </div>
      </div>
      <div className="card scroll-x">
        <table className="att-table">
          <thead><tr><th>월</th><th>주일</th>{YEAR_COLS.map(([k, n]) => <th key={k} className={k === 'adult' || k === 'total' ? 'is-sum' : ''}>{n}</th>)}</tr></thead>
          <tbody>
            {weeks === null ? <tr><td colSpan={7}><span className="skeleton" /></td></tr> : months.map((r) => (
              <tr key={r.month} className={r.n ? 'is-click' : ''} onClick={r.n ? () => onPickMonth(new Date(year, r.month, 1)) : undefined}>
                <th>{r.month + 1}월</th><td className="muted">{r.n || '–'}</td>
                {YEAR_COLS.map(([k]) => <td key={k} className={k === 'adult' || k === 'total' ? 'is-sum' : ''}>{fmt(r[k])}</td>)}
              </tr>
            ))}
          </tbody>
          {weeks?.length > 0 && <tfoot><tr><th>한 해</th><td className="muted">{weeks.length}</td>{YEAR_COLS.map(([k]) => <td key={k} className={k === 'adult' || k === 'total' ? 'is-sum' : ''}>{fmt(avg(weeks.map((w) => w.s[k])))}</td>)}</tr></tfoot>}
        </table>
      </div>
    </section>
  )
}

/* ---------- 분석 ---------- */
const SERIES = [['total', '합계'], ['adult', '장년 합'], ['main', '1~3부'], ['youth', '청년'], ['edu', '교육']]

function LineChart({ points, label }) {
  // points: [{ x: 이름, y: 값 }] — 한 줄만 그린다 (크기가 다른 값을 한 축에 섞지 않으려고 고르게 함)
  const [hover, setHover] = useState(null)
  const W = 720, H = 240, L = 46, R = 26, T = 14, B = 30
  const ys = points.map((p) => p.y).filter((y) => y != null)
  if (!ys.length) return <p className="muted small">기록이 없습니다.</p>
  // 눈금은 1·2·5 단위의 깔끔한 숫자로
  const rawLo = Math.min(...ys), rawHi = Math.max(...ys)
  const span0 = Math.max(rawHi - rawLo, rawHi * 0.05, 10) / 4
  const mag = 10 ** Math.floor(Math.log10(span0)), step = [1, 2, 5, 10].map((m) => m * mag).find((x) => x >= span0)
  const lo = Math.max(0, Math.floor(rawLo / step) * step - (rawLo % step === 0 ? step : 0)), hi = Math.ceil(rawHi / step) * step + (rawHi % step === 0 ? step : 0)
  const x = (i) => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1))
  const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo || 1)
  const ticks = []; for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(t)
  let d = '', pen = false
  points.forEach((p, i) => { if (p.y == null) { pen = false; return } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`; pen = true })
  const every = Math.ceil(points.length / 12)
  return (
    <div className="att-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} 추이`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" /><text x={L - 8} y={y(t) + 4} textAnchor="end" className="tick">{fmt(t)}</text></g>)}
        {points.map((p, i) => i % every === 0 && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="tick">{p.x}</text>)}
        <path d={d} className="line" />
        {points.map((p, i) => p.y != null && (
          <g key={i} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
            <rect x={x(i) - (W - L - R) / points.length / 2} y={T} width={(W - L - R) / points.length} height={H - T - B} fill="transparent" />
            <circle cx={x(i)} cy={y(p.y)} r={hover === i ? 5 : 3} className="dot" />
          </g>
        ))}
        {hover != null && points[hover]?.y != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="cross" />}
      </svg>
      {hover != null && points[hover]?.y != null && <p className="att-tip"><b>{points[hover].full ?? points[hover].x}</b> {label} {fmt(points[hover].y)}명</p>}
    </div>
  )
}

function Delta({ now, before }) {
  if (now == null || before == null || !before) return null
  const diff = now - before, pct = (diff / before) * 100
  if (Math.abs(pct) < 0.05) return <span className="delta">변동 없음</span>
  return <span className={`delta ${diff > 0 ? 'up' : 'down'}`}>{diff > 0 ? '▲' : '▼'} {fmt(Math.abs(diff))} ({Math.abs(pct).toFixed(1)}%)</span>
}

function AnalysisView() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [series, setSeries] = useState('total')
  const [unit, setUnit] = useState('week')
  const weeks = useYear(year)
  const prev = useYear(year - 1)
  const months = monthAvgs(weeks), prevMonths = monthAvgs(prev)
  if (weeks === null || prev === null) return <section className="block"><div className="card"><span className="skeleton" /></div></section>
  // 기준 달: 올해면 기록이 있는 마지막 달, 지난 해면 12월
  const lastM = [...months].reverse().find((r) => r.n)?.month ?? 0
  const cur = months[lastM], before = lastM > 0 ? months[lastM - 1] : prevMonths[11]
  const yAvg = (k) => avg(weeks.map((w) => w.s[k]))
  const cards = [['total', '합계'], ['adult', '장년 합'], ['youth', '청년'], ['edu', '교육']]
  const label = SERIES.find(([k]) => k === series)[1]
  const points = unit === 'week'
    ? weeks.map((w) => ({ x: `${w.d.getMonth() + 1}/${w.d.getDate()}`, y: w.s[series] }))
    : months.map((r) => ({ x: `${r.month + 1}월`, full: `${r.month + 1}월 평균`, y: r[series] }))
  // 부서별 비교: 그 부서 숫자가 있는 주일만으로 평균
  const depts = ALL_SLOTS.map(([k, n]) => ({ k, n, v: avg(weeks.map((w) => w.s[k])) }))
  const maxD = Math.max(1, ...depts.map((x) => x.v ?? 0))
  const hasPrev = prev.length > 0
  return (
    <>
      <section className="block">
        <div className="block-head">
          <h2 className="pill">{year}년 분석</h2>
          <div className="month-nav">
            <button type="button" className="icon-btn light" aria-label="이전 해" onClick={() => setYear(year - 1)}>‹</button>
            <button type="button" className="icon-btn light" aria-label="다음 해" onClick={() => setYear(year + 1)}>›</button>
          </div>
        </div>
        <div className="att-cards">
          {cards.map(([k, n]) => (
            <div key={k} className="card att-stat">
              <span className="muted small">{n} · 올해 주일 평균</span>
              <b className="att-big">{fmt(yAvg(k))}</b>
              <span className="small">{lastM + 1}월 평균 {fmt(cur[k])} <Delta now={cur[k]} before={before?.[k]} /></span>
            </div>
          ))}
        </div>
        <p className="small muted">{lastM + 1}월 평균을 {lastM > 0 ? `${lastM}월` : '작년 12월'}과 비교 · 주일 {weeks.length}번 기록</p>
      </section>

      <section className="block">
        <div className="block-head">
          <h2 className="pill">추이</h2>
          <div className="seg" role="group" aria-label="보는 값">
            {SERIES.map(([k, n]) => <button key={k} type="button" className={series === k ? 'is-on' : ''} aria-pressed={series === k} onClick={() => setSeries(k)}>{n}</button>)}
          </div>
          <div className="seg" role="group" aria-label="단위">
            {[['week', '주일별'], ['month', '월 평균']].map(([k, n]) => <button key={k} type="button" className={unit === k ? 'is-on' : ''} aria-pressed={unit === k} onClick={() => setUnit(k)}>{n}</button>)}
          </div>
        </div>
        <div className="card"><LineChart points={points} label={label} /></div>
      </section>

      <section className="block">
        <div className="block-head"><h2 className="pill">부서별 주일 평균</h2></div>
        <div className="card att-bars">
          {depts.map((x) => (
            <div key={x.k} className="att-bar" title={`${x.n} ${fmt(x.v)}명`}>
              <span>{x.n}</span>
              <div className="track">{x.v != null && <i style={{ width: `${(x.v / maxD) * 100}%` }} />}</div>
              <b>{x.v == null ? <small className="muted">기록 없음</small> : fmt(x.v)}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="block">
        <div className="block-head"><h2 className="pill">작년 같은 달과 비교 · 합계 주일 평균</h2></div>
        <div className="card scroll-x">
          {!hasPrev && <p className="small muted">{year - 1}년 기록이 아직 없어 비교할 수 없습니다.</p>}
          <table className="att-table">
            <thead><tr><th>월</th><th>{year}년</th><th>{year - 1}년</th><th>차이</th></tr></thead>
            <tbody>{months.map((r, i) => (
              <tr key={i}><th>{i + 1}월</th><td>{fmt(r.total)}</td><td>{fmt(prevMonths[i].total)}</td><td><Delta now={r.total} before={prevMonths[i].total} /></td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </>
  )
}

export function AttendancePage() {
  const [view, setView] = useState(() => { try { return sessionStorage.getItem('view:attendance') || 'week' } catch { return 'week' } })
  const set = (v) => { setView(v); try { sessionStorage.setItem('view:attendance', v) } catch { /* 괜찮음 */ } }
  const [pick, setPick] = useState(null)
  return (
    <>
      <header className="title">
        <h1 className="display page-title">ATTENDANCE<span className="page-ko">출석현황</span></h1>
        <div className="seg" role="group" aria-label="보기 방식">
          {[['week', '주일별'], ['month', '월별'], ['year', '연별'], ['analysis', '분석']].map(([v, t]) => (
            <button key={v} type="button" className={view === v ? 'is-on' : ''} aria-pressed={view === v} onClick={() => { if (v === 'month') setPick(null); set(v) }}>{t}</button>
          ))}
        </div>
      </header>
      {view === 'week' ? <WeekView /> : view === 'month' ? <MonthView start={pick} /> : view === 'year' ? <YearView onPickMonth={(d) => { setPick(d); set('month') }} /> : <AnalysisView />}
    </>
  )
}
