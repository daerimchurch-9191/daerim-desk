// 본인만 보는 데이터: 할 일(매주 반복 포함), 내 폴더
import { useEffect, useState } from 'react'
import { supabase, toKorean } from './auth.jsx'
import { useData, Modal, ymd, addDays, startOfWeek, DOW_KO, HomeHead } from './live.jsx'

/* ---------- 할 일 ----------
 한 번만 하는 일: due(선택), 끝내면 last_done_on 에 끝낸 날짜.
 매주 반복: repeat_dow(0=일…6=토). 이번 주에 끝냈으면 last_done_on 이 이번 주 안에 있다.
 매주 월요일이 아니라 주일(일요일)에 새 주가 시작된다. */
const isDoneNow = (t, week0) => (t.repeat_dow == null ? t.done : Boolean(t.last_done_on) && t.last_done_on >= ymd(week0) && dueThisWeek(t, week0))

// 매월 반복: repeat_week 1~4 = 첫째~넷째, -1 = 마지막 주의 repeat_dow 요일
const WEEK_NAMES = { 1: '첫째', 2: '둘째', 3: '셋째', 4: '넷째', '-1': '마지막' }
function nthWeekday(year, month, dow, n) {
  if (n === -1) {
    const last = new Date(year, month + 1, 0)
    return addDays(last, -((last.getDay() - dow + 7) % 7))
  }
  const first = new Date(year, month, 1)
  return addDays(first, (dow - first.getDay() + 7) % 7 + (n - 1) * 7)
}
// week0(주일) 이후 가장 가까운 날짜
function nextMonthly(t, week0) {
  for (let i = 0; i < 3; i++) {
    const d = nthWeekday(week0.getFullYear(), week0.getMonth() + i, t.repeat_dow, t.repeat_week)
    if (d >= week0) return d
  }
}
// 이번 주에 해야 하는 반복 할 일인지
const dueThisWeek = (t, week0) => t.repeat_week == null || ymd(nextMonthly(t, week0)) <= ymd(addDays(week0, 6))
const repeatLabel = (t) => (t.repeat_week == null ? `매주 ${DOW_KO[t.repeat_dow]}` : `매월 ${WEEK_NAMES[t.repeat_week]} ${DOW_KO[t.repeat_dow]}`)

export function TodoModal({ initial, onClose }) {
  const { refresh, notify } = useData()
  const editing = Boolean(initial?.id)
  const [f, setF] = useState({
    text: initial?.text ?? '',
    kind: initial?.repeat_dow == null ? 'once' : initial.repeat_week == null ? 'repeat' : 'monthly',
    week: initial?.repeat_week ?? 1,
    due: initial?.due ?? '',
    dow: initial?.repeat_dow ?? new Date().getDay(),
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(action, msg) {
    setBusy(true)
    const { error } = await action
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    refresh(); notify(msg); onClose()
  }
  function save(e) {
    e.preventDefault()
    if (!f.text.trim()) return setError('할 일을 적어 주세요.')
    const row = f.kind === 'once'
      ? { text: f.text.trim(), repeat_dow: null, repeat_week: null, due: f.due || null }
      : { text: f.text.trim(), repeat_dow: Number(f.dow), repeat_week: f.kind === 'monthly' ? Number(f.week) : null, due: null }
    run(editing ? supabase.from('todos').update(row).eq('id', initial.id) : supabase.from('todos').insert(row), editing ? '할 일을 고쳤습니다.' : '할 일을 추가했습니다.')
  }

  return (
    <Modal title={editing ? '할 일 수정' : '할 일 추가'} onClose={onClose} onSubmit={save}
      footer={<>
        {editing && <button type="button" className="btn btn-danger" disabled={busy}
          onClick={() => run(supabase.from('todos').delete().eq('id', initial.id), '할 일을 지웠습니다.')}>삭제</button>}
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </>}>
      <label className="field">할 일<input value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} placeholder="예: 교사 쪽지 발송" autoFocus /></label>
      <fieldset className="segment-field">
        <legend>종류</legend>
        <div className="segment">
          {[['once', '한 번'], ['repeat', '매주 반복'], ['monthly', '매월 반복']].map(([id, name]) => (
            <label key={id} className={f.kind === id ? 'is-on' : ''}>
              <input type="radio" name="kind" checked={f.kind === id} onChange={() => setF({ ...f, kind: id })} />{name}
            </label>
          ))}
        </div>
      </fieldset>
      {f.kind === 'once' ? (
        <label className="field"><span>마감일 <small>(선택)</small></span><input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
      ) : (
        <>
        {f.kind === 'monthly' && (
          <fieldset className="segment-field">
            <legend>몇째 주</legend>
            <div className="segment">
              {[1, 2, 3, 4, -1].map((n) => (
                <label key={n} className={Number(f.week) === n ? 'is-on' : ''}>
                  <input type="radio" name="week" checked={Number(f.week) === n} onChange={() => setF({ ...f, week: n })} />{WEEK_NAMES[n]}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset className="segment-field">
          <legend>{f.kind === 'monthly' ? '요일' : '반복 요일'}</legend>
          <div className="segment">
            {DOW_KO.map((d, i) => (
              <label key={d} className={Number(f.dow) === i ? 'is-on' : ''}>
                <input type="radio" name="dow" checked={Number(f.dow) === i} onChange={() => setF({ ...f, dow: i })} />{d}
              </label>
            ))}
          </div>
        </fieldset>
        {f.kind === 'monthly' && (() => {
          const d = nextMonthly({ repeat_dow: Number(f.dow), repeat_week: Number(f.week) }, new Date(new Date().toDateString()))
          return <p className="muted small">다음 날짜: {d.getMonth() + 1}월 {d.getDate()}일 ({DOW_KO[d.getDay()]}). 해당 날짜가 있는 주에만 이번 주 목록에 나타납니다.</p>
        })()}
        </>
      )}
      <p className="muted small">나만 보는 할 일입니다.{f.kind === 'repeat' && ' 매주 주일에 새로 시작됩니다.'}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

export function Todos() {
  const { version, openModal } = useData()
  const [todos, setTodos] = useState(null)
  const [filter, setFilter] = useState('today')
  const week0 = startOfWeek()
  const today = ymd(new Date())
  const todayDow = new Date().getDay()
  const weekEnd = ymd(addDays(week0, 6))

  useEffect(() => {
    supabase.from('todos').select('*').order('created_at').then(({ data }) => setTodos(data ?? []))
  }, [version])

  const open = (initial) => openModal({ render: (close) => <TodoModal initial={initial} onClose={close} /> })

  // 끝낸 일회성 할 일은 끝낸 주까지만 보인다
  const visible = (todos ?? []).filter((t) => t.repeat_dow != null || !t.done || (t.last_done_on && t.last_done_on >= ymd(week0)))
  const filters = [
    { id: 'today', name: '오늘', test: (t) => (t.repeat_dow != null ? t.repeat_dow === todayDow && dueThisWeek(t, week0) : !t.done && (!t.due || t.due <= today)) }, // 마감 없는 할 일도 오늘에 보인다
    { id: 'week', name: '이번 주', test: (t) => (t.repeat_dow != null ? dueThisWeek(t, week0) : !t.due || t.due <= weekEnd) },
    { id: 'repeat', name: '반복', test: (t) => t.repeat_dow != null },
    { id: 'later', name: '다음 주 이후', test: (t) => (t.repeat_dow != null ? !dueThisWeek(t, week0) : Boolean(t.due) && t.due > weekEnd) },
  ]
  const shown = visible.filter(filters.find((f) => f.id === filter).test)
    .sort((a, b) => isDoneNow(a, week0) - isDoneNow(b, week0) || (a.repeat_dow ?? 9) - (b.repeat_dow ?? 9) || (a.due ?? '9').localeCompare(b.due ?? '9'))

  async function toggle(t) {
    const nowDone = !isDoneNow(t, week0)
    const patch = t.repeat_dow == null
      ? { done: nowDone, last_done_on: nowDone ? today : null }
      : { last_done_on: nowDone ? today : null }
    setTodos(todos.map((x) => (x.id === t.id ? { ...x, ...patch } : x))) // 서버 응답 전에 먼저 반영
    const { error } = await supabase.from('todos').update(patch).eq('id', t.id)
    if (error) setTodos(todos) // 실패하면 되돌림
  }

  const allDone = shown.length > 0 && shown.every((t) => isDoneNow(t, week0))

  const sub = (t) => {
    if (t.repeat_dow != null) {
      if (t.repeat_week == null) return repeatLabel(t)
      const d = nextMonthly(t, week0)
      return `${repeatLabel(t)} · ${d.getMonth() + 1}/${d.getDate()}`
    }
    if (!t.due) return '마감 없음'
    const md = `${Number(t.due.slice(5, 7))}/${Number(t.due.slice(8))}`
    if (!t.done && t.due < today) return <span className="is-late">지남 {md}</span>
    return t.due === today ? '오늘 마감' : `${md} 마감`
  }
  const left = shown.filter((t) => !isDoneNow(t, week0)).length

  return (
    <section className="hc" aria-labelledby="todo-h">
      <HomeHead id="todo-h" title={<>할 일 <span className="hc-sub">{todos === null ? '' : `${left}개 남음`}</span></>}>
        <span className="hc-seg" role="group" aria-label="할 일 보기">
          {filters.map((f) => (
            <button key={f.id} type="button" className={filter === f.id ? 'is-on' : ''} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.name}</button>
          ))}
        </span>
      </HomeHead>
      {todos === null && <span className="skeleton" />}
      {todos !== null && shown.length === 0 && (
        <div className="empty">{todos.length === 0 ? '아직 할 일이 없습니다. "+ 할 일 추가"로 시작해 보세요.' : '여기에 해당하는 할 일이 없습니다.'}</div>
      )}
      <div className="hc-list">
        {shown.map((t) => {
          const done = isDoneNow(t, week0)
          return (
            <div key={t.id} className="hc-row">
              <input id={`todo-${t.id}`} className="hc-check" type="checkbox" checked={done} onChange={() => toggle(t)} />
              <label htmlFor={`todo-${t.id}`} className={`hc-text${done ? ' is-done' : ''}`}><b>{t.text}</b><span>{sub(t)}</span></label>
              <span className="hc-end"><button type="button" className="hc-edit" onClick={() => open(t)}>수정</button></span>
            </div>
          )
        })}
      </div>
      {allDone && <p className="note">여기 있는 할 일을 모두 끝냈어요.</p>}
      <button type="button" className="hc-add" onClick={() => open(null)}>+ 할 일 추가</button>
    </section>
  )
}
