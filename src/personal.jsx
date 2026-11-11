// 본인만 보는 데이터: 할 일(매주 반복 포함), 내 폴더
import { useEffect, useState } from 'react'
import { supabase, toKorean } from './auth.jsx'
import { useData, Modal, ymd, addDays, startOfWeek, DOW_KO } from './live.jsx'
import { folderColors } from './data.js'

/* ---------- 할 일 ----------
 한 번만 하는 일: due(선택), 끝내면 last_done_on 에 끝낸 날짜.
 매주 반복: repeat_dow(0=일…6=토). 이번 주에 끝냈으면 last_done_on 이 이번 주 안에 있다.
 매주 월요일이 아니라 주일(일요일)에 새 주가 시작된다. */
const isDoneNow = (t, week0) => (t.repeat_dow == null ? t.done : Boolean(t.last_done_on) && t.last_done_on >= ymd(week0))

function TodoModal({ initial, onClose }) {
  const { refresh, notify } = useData()
  const editing = Boolean(initial?.id)
  const [f, setF] = useState({
    text: initial?.text ?? '',
    kind: initial?.repeat_dow != null ? 'repeat' : 'once',
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
    const row = f.kind === 'repeat'
      ? { text: f.text.trim(), repeat_dow: Number(f.dow), due: null }
      : { text: f.text.trim(), repeat_dow: null, due: f.due || null }
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
          {[['once', '한 번'], ['repeat', '매주 반복']].map(([id, name]) => (
            <label key={id} className={f.kind === id ? 'is-on' : ''}>
              <input type="radio" name="kind" checked={f.kind === id} onChange={() => setF({ ...f, kind: id })} />{name}
            </label>
          ))}
        </div>
      </fieldset>
      {f.kind === 'once' ? (
        <label className="field">마감일 <small>(선택)</small><input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
      ) : (
        <fieldset className="segment-field">
          <legend>반복 요일</legend>
          <div className="segment">
            {DOW_KO.map((d, i) => (
              <label key={d} className={Number(f.dow) === i ? 'is-on' : ''}>
                <input type="radio" name="dow" checked={Number(f.dow) === i} onChange={() => setF({ ...f, dow: i })} />{d}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <p className="muted small">나만 보는 할 일입니다.{f.kind === 'repeat' && ' 매주 주일에 새로 시작됩니다.'}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

export function Todos() {
  const { version, openModal } = useData()
  const [todos, setTodos] = useState(null)
  const [filter, setFilter] = useState('week')
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
    { id: 'week', name: '이번 주', test: (t) => t.repeat_dow != null || !t.due || t.due <= weekEnd },
    { id: 'today', name: '오늘', test: (t) => (t.repeat_dow != null ? t.repeat_dow === todayDow : !t.done && t.due && t.due <= today) },
    { id: 'repeat', name: '매주 반복', test: (t) => t.repeat_dow != null },
    { id: 'later', name: '다음 주 이후', test: (t) => t.repeat_dow == null && Boolean(t.due) && t.due > weekEnd },
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

  const chip = (t) => {
    if (t.repeat_dow != null) return <span className="chip">매주 {DOW_KO[t.repeat_dow]}</span>
    if (!t.due) return null
    if (!t.done && t.due < today) return <span className="chip chip-warn">지남 {Number(t.due.slice(5, 7))}/{Number(t.due.slice(8))}</span>
    if (t.due === today) return <span className="chip chip-plain">오늘</span>
    return <span className="chip chip-plain">{Number(t.due.slice(5, 7))}/{Number(t.due.slice(8))}</span>
  }

  const allDone = shown.length > 0 && shown.every((t) => isDoneNow(t, week0))

  return (
    <section className="block" aria-labelledby="todo-h">
      <h2 id="todo-h" className="pill">Todolist</h2>
      <div className="card">
        <div className="tabs">
          {filters.map((f) => (
            <button key={f.id} type="button" className={`tab${filter === f.id ? ' is-on' : ''}`}
              aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.name} {visible.filter(f.test).filter((t) => !isDoneNow(t, week0)).length}
            </button>
          ))}
          <button type="button" className="btn btn-primary tabs-end" onClick={() => open(null)}>+ 할 일 추가</button>
        </div>
        {todos === null && <span className="skeleton" />}
        {todos !== null && shown.length === 0 && (
          <div className="empty">{todos.length === 0 ? '아직 할 일이 없습니다. "+ 할 일 추가"로 시작해 보세요.' : '여기에 해당하는 할 일이 없습니다.'}</div>
        )}
        {shown.map((t) => {
          const done = isDoneNow(t, week0)
          return (
            <div key={t.id} className="todo-row">
              <input id={`todo-${t.id}`} type="checkbox" checked={done} onChange={() => toggle(t)} />
              <label htmlFor={`todo-${t.id}`} className={`grow${done ? ' is-done' : ''}`}>{t.text}</label>
              {chip(t)}
              <button type="button" className="link-btn" onClick={() => open(t)}>수정</button>
            </div>
          )
        })}
        {allDone && <p className="note">이번 주 할 일을 모두 끝냈어요.</p>}
      </div>
    </section>
  )
}

/* ---------- 내 폴더 ---------- */
function FolderIcon({ color }) {
  const c = folderColors.find((f) => f.id === color) ?? folderColors[0]
  return (
    <svg aria-hidden="true" width="72" height="56" viewBox="0 0 76 60">
      <path d="M4 12a6 6 0 0 1 6-6h18l7 8h31a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill={c.dark} />
      <path d="M4 22h68v28a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill={c.light} />
    </svg>
  )
}

// 주소에 http(s):// 가 없으면 붙여서 연다. 비어 있으면 열 곳이 없다.
const toHref = (s) => (!s ? null : /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`)

function FolderModal({ initial, count, onClose }) {
  const { refresh, notify } = useData()
  const editing = Boolean(initial?.id)
  const [f, setF] = useState({ name: initial?.name ?? '', href: initial?.href ?? '', color: initial?.color ?? 'green' })
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
    if (!f.name.trim()) return setError('폴더 이름을 적어 주세요.')
    const row = { name: f.name.trim(), href: f.href.trim() || null, color: f.color }
    run(editing ? supabase.from('folders').update(row).eq('id', initial.id) : supabase.from('folders').insert({ ...row, sort: count }),
      editing ? '폴더를 고쳤습니다.' : '폴더를 추가했습니다.')
  }

  return (
    <Modal title={editing ? '폴더 수정' : '폴더 추가'} onClose={onClose} onSubmit={save}
      footer={<>
        {editing && <button type="button" className="btn btn-danger" disabled={busy}
          onClick={() => run(supabase.from('folders').delete().eq('id', initial.id), '폴더를 지웠습니다.')}>삭제</button>}
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : editing ? '저장' : '추가하기'}</button>
      </>}>
      <div className="dialog-preview"><FolderIcon color={f.color} /><span>고른 색으로 홈 화면 폴더 줄에 나타납니다. 나만 보는 폴더입니다.</span></div>
      <label className="field">폴더 이름<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="예: 예배 자료" autoFocus /></label>
      <label className="field">연결할 주소<input value={f.href} onChange={(e) => setF({ ...f, href: e.target.value })} placeholder="나스 폴더 주소, 구글 드라이브 링크 등" /></label>
      <fieldset className="swatches">
        <legend>폴더 색</legend>
        {folderColors.map((c) => (
          <label key={c.id} className="swatch">
            <input type="radio" name="color" checked={f.color === c.id} onChange={() => setF({ ...f, color: c.id })} />
            <span className="swatch-dot" style={{ background: c.dark }} />{c.name}
          </label>
        ))}
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

export function Folders() {
  const { version, openModal } = useData()
  const [folders, setFolders] = useState(null)
  useEffect(() => {
    supabase.from('folders').select('*').order('sort').order('id').then(({ data }) => setFolders(data ?? []))
  }, [version])
  const open = (initial) => openModal({ render: (close) => <FolderModal initial={initial} count={folders?.length ?? 0} onClose={close} /> })

  return (
    <section className="folders" aria-label="내 폴더">
      {(folders ?? []).map((f) => {
        const href = toHref(f.href)
        return (
          <div key={f.id} className="folder-wrap">
            {href
              ? <a href={href} target="_blank" rel="noreferrer" className="folder"><FolderIcon color={f.color} />{f.name}</a>
              : <button type="button" className="folder folder-plain" onClick={() => open(f)}><FolderIcon color={f.color} />{f.name}</button>}
            <button type="button" className="folder-edit" aria-label={`${f.name} 폴더 수정`} onClick={() => open(f)}>⋮</button>
          </div>
        )
      })}
      <button type="button" className="folder folder-add" onClick={() => open(null)}>
        <span className="folder-add-box" aria-hidden="true">+</span>폴더 추가
      </button>
    </section>
  )
}
