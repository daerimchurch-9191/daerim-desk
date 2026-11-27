// 연차: 신청·내 연차 (누구나) / 승인·반려·연차 부여·연차 캘린더 (연차 관리자 = 관리자 또는 leave_admin 권한)
// 승인하면 서버 함수(decide_leave)가 신청한 사람의 개인 일정(나만 보기)을 만든다.
import { useEffect, useMemo, useState } from 'react'
import { supabase, useAuth, toKorean, can } from './auth.jsx'
import { useData, Modal, ymd, addDays, sameDay, DOW_KO, layoutRow, BarTag } from './live.jsx'

const PART = { full: '연차' } // 우리 교회는 반차가 없다 (2026-11-25)
const STATUS = { pending: '승인 대기', approved: '승인', rejected: '반려', cancelled: '취소' }
const dt = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const md = (s) => { const d = dt(s); return `${d.getMonth() + 1}/${d.getDate()}(${DOW_KO[d.getDay()]})` }
const range = (r) => (r.start_date === r.end_date ? md(r.start_date) : `${md(r.start_date)} ~ ${md(r.end_date)}`)
const days = (n) => `${Number(n)}일`
const between = (a, b) => Math.round((dt(b) - dt(a)) / 864e5) + 1
// 올해 쓴 날·대기 중인 날 (시작일 기준 연도)
const usedIn = (list, year, status) => list.filter((r) => r.status === status && r.start_date.startsWith(String(year))).reduce((s, r) => s + Number(r.days), 0)

function useLeavePage() {
  const read = () => (location.hash === '#leave/admin' ? 'admin' : location.hash === '#leave/grant' ? 'grant' : location.hash === '#leave/calendar' ? 'calendar' : 'mine')
  const [tab, setTab] = useState(read)
  useEffect(() => { const on = () => setTab(read()); window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on) }, [])
  return tab
}

export function LeavePage() {
  const { profile } = useAuth()
  const manager = can(profile, 'leave_admin')
  const tab = useLeavePage()
  const [reqs, setReqs] = useState(null) // 내 신청 (관리자는 모두)
  const [balances, setBalances] = useState([])
  const [people, setPeople] = useState([])
  const [error, setError] = useState('')
  const year = new Date().getFullYear()

  async function load() {
    const [r, b, p] = await Promise.all([
      supabase.from('leave_requests').select('*').order('start_date', { ascending: false }).limit(500),
      supabase.from('leave_balances').select('*'),
      manager ? supabase.from('profiles').select('id, name, title').eq('status', 'approved').order('name') : Promise.resolve({ data: [] }),
    ])
    if (r.error) return setError(toKorean(r.error.message))
    setReqs(r.data ?? []); setBalances(b.data ?? []); setPeople(p.data ?? [])
  }
  useEffect(() => { load() }, [])

  const pending = (reqs ?? []).filter((r) => r.status === 'pending')
  const tabs = [{ id: 'mine', name: '내 연차', href: '#leave' }]
  if (manager) tabs.push({ id: 'admin', name: `승인 대기 ${pending.length}`, href: '#leave/admin' }, { id: 'grant', name: '연차 부여', href: '#leave/grant' }, { id: 'calendar', name: '연차 캘린더', href: '#leave/calendar' })
  const shownTab = manager ? tab : 'mine'

  return (
    <>
      <header className="title">
        <h1 className="page-title page-title-ko">연차</h1>
      </header>
      {tabs.length > 1 && (
        <nav className="tabs admin-tabs" aria-label="연차 메뉴">
          {tabs.map((t) => <a key={t.id} href={t.href} className={`tab${shownTab === t.id ? ' is-on' : ''}`} aria-current={shownTab === t.id ? 'page' : undefined}>{t.name}</a>)}
        </nav>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {shownTab === 'mine' && <MyLeave reqs={(reqs ?? []).filter((r) => r.profile_id === profile.id)} loading={reqs === null}
        balance={balances.find((b) => b.profile_id === profile.id && b.year === year)} year={year} onChange={load} />}
      {shownTab === 'admin' && <Approvals reqs={reqs ?? []} people={people} balances={balances} year={year} onChange={load} />}
      {shownTab === 'grant' && <Grant reqs={reqs ?? []} people={people} balances={balances} onChange={load} />}
      {shownTab === 'calendar' && <LeaveCalendar reqs={reqs ?? []} people={people} onChange={load} />}
    </>
  )
}

/* ---------- 내 연차 ---------- */
function MyLeave({ reqs, loading, balance, year, onChange }) {
  const { openModal, notify } = useData()
  const granted = Number(balance?.days ?? 0)
  const used = usedIn(reqs, year, 'approved')
  const waiting = usedIn(reqs, year, 'pending')
  const left = granted - used
  async function cancel(r) {
    const { error } = await supabase.rpc('cancel_leave', { req: r.id })
    if (error) return notify(toKorean(error.message))
    notify('신청을 취소했습니다.'); onChange()
  }
  return (
    <section className="block" aria-labelledby="my-leave-h">
      <div className="block-head">
        <h2 id="my-leave-h" className="pill">{year}년 내 연차</h2>
        <button type="button" className="btn btn-primary" onClick={() => openModal({ render: (close) => <LeaveRequestModal onClose={close} onDone={() => { onChange(); notify('연차를 신청했습니다. 승인되면 알려 드립니다.') }} left={left - waiting} /> })}>+ 연차 신청</button>
      </div>
      <div className="leave-summary">
        <div className="leave-stat"><span>부여</span><b>{balance ? days(granted) : '—'}</b></div>
        <div className="leave-stat"><span>사용</span><b>{days(used)}</b></div>
        <div className="leave-stat"><span>승인 대기</span><b>{days(waiting)}</b></div>
        <div className="leave-stat is-key"><span>남은 연차</span><b>{balance ? days(left) : '—'}</b></div>
      </div>
      {!balance && <p className="muted small">아직 올해 연차가 부여되지 않았습니다. 연차 관리자에게 문의해 주세요.</p>}
      <div className="card">
        <h3 className="sub-h">내 신청</h3>
        {loading ? <span className="skeleton" /> : reqs.length === 0 ? <p className="muted small">아직 신청한 연차가 없습니다.</p> : (
          <ul className="leave-list">
            {reqs.map((r) => (
              <li key={r.id}>
                <div className="grow"><b>{range(r)}</b> <span className="muted">{PART[r.part]} · {days(r.days)}</span>
                  {r.reason && <small className="muted block">{r.reason}</small>}
                  {r.decision_note && <small className="muted block">관리자 메모: {r.decision_note}</small>}</div>
                <span className={`chip leave-${r.status}`}>{STATUS[r.status]}</span>
                {r.status === 'pending' && <button type="button" className="btn-link small" onClick={() => cancel(r)}>취소</button>}
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">승인되면 내 캘린더에 개인 일정(나만 보기)으로 들어갑니다. 승인된 연차를 취소하려면 연차 관리자에게 부탁해 주세요.</p>
      </div>
    </section>
  )
}

function LeaveRequestModal({ onClose, onDone, left }) {
  const { profile } = useAuth()
  const today = ymd(new Date())
  const [f, setF] = useState({ part: 'full', start: today, end: today, days: 1, reason: '' })
  const [touched, setTouched] = useState(false) // 일수를 직접 고쳤는가
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const auto = (x) => Math.max(1, between(x.start, x.end))
  const set = (patch) => { const x = { ...f, ...patch }; if (x.end < x.start) x.end = x.start; if (!touched) x.days = auto(x); setF(x); setError('') }
  async function save(e) {
    e.preventDefault()
    if (!(f.days > 0)) return setError('일수를 적어 주세요.')
    setBusy(true)
    const { error } = await supabase.from('leave_requests').insert({ profile_id: profile.id, start_date: f.start, end_date: f.end, part: f.part, days: f.days, reason: f.reason.trim() || null })
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    onDone(); onClose()
  }
  return (
    <Modal title="연차 신청" onClose={onClose} onSubmit={save}
      footer={<><button type="button" className="btn" onClick={onClose}>취소</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '신청 중…' : '신청'}</button></>}>
      <div className="field-row">
        <label className="field">시작 날짜<input type="date" value={f.start} onChange={(e) => set({ start: e.target.value })} required /></label>
        <label className="field">끝 날짜<input type="date" value={f.end} min={f.start} onChange={(e) => set({ end: e.target.value })} required /></label>
      </div>
      <label className="field"><span>쓰는 일수 <small>(쉬는 날이 끼어 있으면 고쳐 주세요)</small></span>
        <input type="number" inputMode="decimal" step="1" min="1" max="60" value={f.days} onChange={(e) => { setTouched(true); setF({ ...f, days: Math.round(Number(e.target.value)) }) }} />
      </label>
      <label className="field"><span>사유 <small>(선택)</small></span><input value={f.reason} maxLength={300} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
      {Number.isFinite(left) && <p className={`small ${f.days > left ? 'form-error' : 'muted'}`}>신청 뒤 남는 연차: {days(left - f.days)}{f.days > left ? ' (부여된 연차보다 많습니다)' : ''}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

/* ---------- 승인 대기 (연차 관리자) ---------- */
const nameOf = (people, id) => { const p = people.find((x) => x.id === id); return p ? `${p.name} ${p.title ?? ''}`.trim() : '알 수 없음' }

function DecideModal({ r, people, onClose, onDone }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function decide(approve) {
    setBusy(true)
    const { error } = await supabase.rpc('decide_leave', { req: r.id, approve, note: note.trim() || null })
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    onDone(approve); onClose()
  }
  async function cancel() {
    setBusy(true)
    const { error } = await supabase.rpc('cancel_leave', { req: r.id })
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    onDone(null); onClose()
  }
  return (
    <Modal title="연차 처리" onClose={onClose} onSubmit={(e) => e.preventDefault()}
      footer={r.status === 'pending'
        ? <><button type="button" className="btn btn-danger" disabled={busy} onClick={() => decide(false)}>반려</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => decide(true)}>승인</button></>
        : <><button type="button" className="btn" onClick={onClose}>닫기</button>{r.status === 'approved' && <button type="button" className="btn btn-danger" disabled={busy} onClick={cancel}>승인 취소</button>}</>}>
      <p><b>{nameOf(people, r.profile_id)}</b> · {range(r)} · {PART[r.part]} {days(r.days)}</p>
      {r.reason && <p className="muted small">사유: {r.reason}</p>}
      {r.status === 'pending'
        ? <label className="field"><span>메모 <small>(선택, 신청한 사람에게 보입니다)</small></span><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>
        : <p className="muted small">상태: {STATUS[r.status]}{r.status === 'approved' ? ' · 승인을 취소하면 그 사람 캘린더의 연차 일정도 지워집니다.' : ''}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

function Approvals({ reqs, people, balances, year, onChange }) {
  const { openModal, notify } = useData()
  const pending = reqs.filter((r) => r.status === 'pending').sort((a, b) => a.start_date.localeCompare(b.start_date))
  const recent = reqs.filter((r) => r.status !== 'pending').slice(0, 30)
  const leftOf = (id) => {
    const b = balances.find((x) => x.profile_id === id && x.year === year)
    return b ? Number(b.days) - usedIn(reqs.filter((r) => r.profile_id === id), year, 'approved') : null
  }
  const open = (r) => openModal({ render: (close) => <DecideModal r={r} people={people} onClose={close}
    onDone={(ok) => { onChange(); notify(ok === true ? '승인했습니다. 신청한 사람의 캘린더에 들어갔습니다.' : ok === false ? '반려했습니다.' : '승인을 취소했습니다.') }} /> })
  return (
    <section className="block" aria-labelledby="leave-wait-h">
      <h2 id="leave-wait-h" className="pill">승인 대기 {pending.length}</h2>
      <div className="card">
        {pending.length === 0 ? <p className="muted small">기다리는 신청이 없습니다.</p> : (
          <ul className="leave-list">
            {pending.map((r) => {
              const left = leftOf(r.profile_id)
              return (
                <li key={r.id}>
                  <div className="grow"><b>{nameOf(people, r.profile_id)}</b> <span>{range(r)}</span> <span className="muted">{PART[r.part]} · {days(r.days)}</span>
                    <small className="muted block">{left === null ? '올해 연차 미부여' : `남은 연차 ${days(left)}`}{r.reason ? ` · ${r.reason}` : ''}</small></div>
                  <button type="button" className="btn btn-primary" onClick={() => open(r)}>처리</button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <h3 className="sub-h">최근 처리</h3>
      <div className="card">
        {recent.length === 0 ? <p className="muted small">아직 처리한 신청이 없습니다.</p> : (
          <ul className="leave-list">
            {recent.map((r) => (
              <li key={r.id}>
                <div className="grow"><b>{nameOf(people, r.profile_id)}</b> <span>{range(r)}</span> <span className="muted">{PART[r.part]} · {days(r.days)}</span></div>
                <span className={`chip leave-${r.status}`}>{STATUS[r.status]}</span>
                {r.status === 'approved' && <button type="button" className="btn-link small" onClick={() => open(r)}>보기</button>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/* ---------- 연차 부여 ---------- */
function Grant({ reqs, people, balances, onChange }) {
  const { notify } = useData()
  const [year, setYear] = useState(new Date().getFullYear())
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const base = (id) => balances.find((b) => b.profile_id === id && b.year === year)
  const value = (id) => (id in draft ? draft[id] : base(id) ? String(Number(base(id).days)) : '')
  useEffect(() => setDraft({}), [year])
  const changed = Object.entries(draft).filter(([id, v]) => v !== '' && Number(v) !== Number(base(id)?.days ?? NaN))
  async function save() {
    if (changed.some(([, v]) => !(Number(v) >= 0 && Number(v) <= 365))) return setError('0~365 사이 숫자로 적어 주세요.')
    setBusy(true); setError('')
    // 한 번에 저장 (모두 되거나 모두 안 됨)
    const { error } = await supabase.from('leave_balances').upsert(changed.map(([id, v]) => ({ profile_id: id, year, days: Number(v), updated_at: new Date().toISOString() })))
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    notify(`${changed.length}명의 연차를 저장했습니다.`); setDraft({}); onChange()
  }
  return (
    <section className="block" aria-labelledby="grant-h">
      <div className="block-head">
        <h2 id="grant-h" className="pill">{year}년 연차 부여</h2>
        <div className="month-nav">
          <button type="button" className="icon-btn light" aria-label="이전 해" onClick={() => setYear(year - 1)}>‹</button>
          <button type="button" className="icon-btn light" aria-label="다음 해" onClick={() => setYear(year + 1)}>›</button>
        </div>
        <button type="button" className="btn btn-primary" disabled={!changed.length || busy} onClick={save}>{busy ? '저장 중…' : changed.length ? `저장 (${changed.length})` : '저장'}</button>
      </div>
      <div className="card scroll-x">
        <table className="grant-table">
          <thead><tr><th scope="col">사역자</th><th scope="col">부여</th><th scope="col">사용</th><th scope="col">대기</th><th scope="col">남음</th></tr></thead>
          <tbody>
            {people.map((p) => {
              const mine = reqs.filter((r) => r.profile_id === p.id)
              const used = usedIn(mine, year, 'approved'), wait = usedIn(mine, year, 'pending')
              const v = value(p.id)
              return (
                <tr key={p.id}>
                  <th scope="row">{p.name} {p.title}</th>
                  <td><input className="grant-input" type="number" inputMode="numeric" step="1" min="0" max="365" aria-label={`${p.name} ${year}년 부여 일수`}
                    value={v} placeholder="—" onChange={(e) => setDraft({ ...draft, [p.id]: e.target.value })} /></td>
                  <td>{days(used)}</td><td>{days(wait)}</td>
                  <td><b>{v === '' ? '—' : days(Number(v) - used)}</b></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}

/* ---------- 연차 캘린더 ---------- */
function LeaveCalendar({ reqs, people, onChange }) {
  const { openModal, notify } = useData()
  const now = new Date()
  const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const next = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const items = useMemo(() => reqs.filter((r) => r.status === 'approved' || r.status === 'pending').map((r) => ({
    id: `l${r.id}`, req: r, all_day: true, dept_id: 'leave',
    title: `${people.find((p) => p.id === r.profile_id)?.name ?? ''} ${PART[r.part]}${r.status === 'pending' ? ' (대기)' : ''}`,
    starts_at: dt(r.start_date).toISOString(), ends_at: addDays(dt(r.end_date), 1).toISOString(),
  })), [reqs, people])
  const cells = []
  for (let i = 0; i < month.getDay(); i++) cells.push(null)
  for (let d = new Date(month); d < next; d = addDays(d, 1)) cells.push(d)
  while (cells.length % 7) cells.push(null)
  const lay = cells.flatMap((_, i) => (i % 7 ? [] : layoutRow(cells.slice(i, i + 7), items)))
  const open = (e) => openModal({ render: (close) => <DecideModal r={e.req} people={people} onClose={close}
    onDone={(ok) => { onChange(); notify(ok === true ? '승인했습니다.' : ok === false ? '반려했습니다.' : '승인을 취소했습니다.') }} /> })
  const cls = (e) => `tag-leave${e.req.status === 'pending' ? ' is-pending' : ''}`
  return (
    <section className="block" aria-labelledby="leave-cal-h">
      <div className="block-head">
        <h2 id="leave-cal-h" className="pill">{month.getFullYear()}년 {month.getMonth() + 1}월 연차</h2>
        <div className="month-nav">
          <button type="button" className="icon-btn light" aria-label="이전 달" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
          <button type="button" className="icon-btn light" aria-label="다음 달" onClick={() => setMonth(next)}>›</button>
        </div>
        <span className="tag tag-leave round">승인</span><span className="tag tag-leave is-pending round">승인 대기</span>
      </div>
      <div className="card scroll-x">
        <div className="month month-grid-always">
          {DOW_KO.map((w) => <span key={w} className="month-dow">{w}</span>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="month-cell is-empty" />
            const { bars, singles } = lay[i]
            return (
              <div key={i} className={`month-cell${sameDay(d, now) ? ' is-today' : ''}`}>
                <span className="month-date" data-dow={DOW_KO[d.getDay()]}>{d.getDate()}</span>
                {bars.map((b) => b.gap ? <span key={b.key} className="bar-gap" aria-hidden="true" /> : <BarTag key={b.key} b={b} d={d} cls={cls(b.e)} onOpen={open} />)}
                {singles.map((e) => <button key={e.id} type="button" className={`tag ${cls(e)} tag-btn`} onClick={() => open(e)}>{e.title}</button>)}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
