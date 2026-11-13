// 심방방: 교구마다 방이 하나씩 있고, 채팅처럼 심방 내용을 주고받는다.
// - 권한 관리에서 "모든 교구"(담임목사님)를 받으면 모든 방, "1교구" 등을 받으면 그 방만 들어간다.
// - 누가 어느 방을 보는지는 데이터베이스 권한 규칙(has_perm)이 정한다. 화면은 그에 맞춰 보여 줄 뿐이다.
// - 고치기·지우기는 자기가 쓴 글만.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase, useAuth, toKorean, visitRooms } from './auth.jsx'
import { useData, DOW_KO, hm, ymd } from './live.jsx'

const PAGE = 150
const TEMPLATE = (d) => `[심방] ${d.getMonth() + 1}/${d.getDate()} (${DOW_KO[d.getDay()]})\n가정: \n함께 간 사람: \n내용: \n기도제목: `
const dayLabel = (d) => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW_KO[d.getDay()]}요일`
const touch = () => window.matchMedia('(pointer: coarse)').matches

function Room({ room }) {
  const { profile } = useAuth()
  const { staff, notify } = useData()
  const [msgs, setMsgs] = useState(null)
  const [more, setMore] = useState(false)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)
  const stick = useRef(true)
  const firstLoad = useRef(true)

  const nameOf = (id) => { const s = staff.find((p) => p.id === id); return s ? `${s.name} ${s.title}` : '알 수 없음' }

  async function fetchLatest() {
    const { data, error } = await supabase.from('visit_messages').select('*').eq('dept_id', room.id)
      .order('created_at', { ascending: false }).limit(PAGE)
    if (error) return setError(toKorean(error.message))
    const fresh = (data ?? []).reverse()
    if (firstLoad.current) { firstLoad.current = false; setMore(fresh.length === PAGE) }
    setMsgs((old) => old ? [...old.filter((m) => fresh.length && m.created_at < fresh[0].created_at), ...fresh] : fresh)
  }
  async function loadOlder() {
    const first = msgs?.[0]
    if (!first) return
    const { data } = await supabase.from('visit_messages').select('*').eq('dept_id', room.id)
      .lt('created_at', first.created_at).order('created_at', { ascending: false }).limit(PAGE)
    stick.current = false
    setMore((data ?? []).length === PAGE)
    setMsgs((old) => [...(data ?? []).reverse(), ...old])
  }

  useEffect(() => {
    setMsgs(null); setEditing(null); setText(''); stick.current = true; firstLoad.current = true
    fetchLatest()
    // 방을 보고 있는 동안 20초마다 새 글 확인 (화면이 가려져 있으면 쉰다)
    const t = setInterval(() => { if (document.visibilityState === 'visible') fetchLatest() }, 20000)
    return () => clearInterval(t)
  }, [room.id])

  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [msgs])
  const onScroll = () => {
    const el = listRef.current
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function send(e) {
    e?.preventDefault()
    const body = text.trim()
    if (!body) return
    setBusy(true); setError('')
    const res = editing
      ? await supabase.from('visit_messages').update({ body, edited_at: new Date().toISOString() }).eq('id', editing.id)
      : await supabase.from('visit_messages').insert({ dept_id: room.id, body })
    setBusy(false)
    if (res.error) return setError(toKorean(res.error.message))
    if (editing) setMsgs((old) => old.map((m) => m.id === editing.id ? { ...m, body, edited_at: new Date().toISOString() } : m))
    setText(''); setEditing(null); stick.current = true
    fetchLatest()
  }
  async function remove(m) {
    const { error } = await supabase.from('visit_messages').delete().eq('id', m.id)
    if (error) return notify(toKorean(error.message))
    setMsgs((old) => old.filter((x) => x.id !== m.id)); notify('글을 지웠습니다.')
  }
  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !touch()) { e.preventDefault(); send() }
  }

  let lastDay = ''
  return (
    <div className="chat">
      <div className="chat-list" ref={listRef} onScroll={onScroll} aria-live="polite">
        {msgs === null && <span className="skeleton" />}
        {more && <button type="button" className="btn btn-link chat-more" onClick={loadOlder}>이전 글 더 보기</button>}
        {msgs?.length === 0 && <div className="empty">{room.name} 심방방이 비어 있습니다. 첫 심방 내용을 남겨 보세요.<br />아래 "양식 넣기"를 누르면 심방보고 틀이 들어갑니다.</div>}
        {msgs?.map((m) => {
          const d = new Date(m.created_at)
          const day = ymd(d)
          const sep = day !== lastDay
          lastDay = day
          const mine = m.created_by === profile.id
          return (
            <div key={m.id}>
              {sep && <div className="chat-day"><span>{dayLabel(d)}</span></div>}
              <div className={`chat-msg${mine ? ' is-mine' : ''}`}>
                {!mine && <span className="chat-who">{nameOf(m.created_by)}</span>}
                <div className="chat-line">
                  <p className="chat-bubble">{m.body}</p>
                  <span className="chat-time">{m.edited_at && '고침 · '}{hm(d)}</span>
                </div>
                {mine && (
                  <span className="chat-actions">
                    <button type="button" onClick={() => { setEditing(m); setText(m.body) }}>고치기</button>
                    <button type="button" onClick={() => remove(m)}>지우기</button>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <form className="chat-compose" onSubmit={send}>
        {editing && <p className="chat-editing">글 고치는 중 · <button type="button" className="btn-link" onClick={() => { setEditing(null); setText('') }}>그만두기</button></p>}
        <textarea value={text} rows={Math.min(8, Math.max(2, text.split('\n').length))} onChange={(e) => { setText(e.target.value); setError('') }} onKeyDown={onKey}
          placeholder={`${room.name}에 심방 내용 남기기 (주민번호·연락처·주소는 적지 마세요)`} aria-label="심방 내용" />
        <div className="chat-bar">
          <button type="button" className="chip-btn" onClick={() => setText((t) => t ? t : TEMPLATE(new Date()))}>양식 넣기</button>
          <span className="muted small grow">{touch() ? '' : 'Enter 보내기 · Shift+Enter 줄바꿈'}</span>
          <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>{busy ? '보내는 중…' : editing ? '고치기' : '보내기'}</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </div>
  )
}

export function VisitsPage() {
  const { profile } = useAuth()
  const { departments } = useData()
  const rooms = visitRooms(profile, departments)
  const [roomId, setRoomId] = useState(null)
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0]

  if (!rooms.length) {
    return (
      <>
        <header className="title"><h1 className="display page-title">VISITS</h1><span className="muted">심방방</span></header>
        <div className="card"><div className="empty">들어갈 수 있는 심방방이 없습니다. 관리자에게 권한을 요청해 주세요.</div></div>
      </>
    )
  }
  return (
    <>
      <header className="title">
        <h1 className="display page-title">VISITS</h1>
        <span className="muted">교구별 심방방 · 권한을 받은 사역자만 들어옵니다</span>
      </header>
      <section className="block" aria-label="심방방">
        <div className="block-head">
          <div className="tabs grow" role="tablist">
            {rooms.map((r) => (
              <button key={r.id} type="button" role="tab" aria-selected={r.id === room.id} className={`tab${r.id === room.id ? ' is-on' : ''}`} onClick={() => setRoomId(r.id)}>{r.name}</button>
            ))}
          </div>
        </div>
        <div className="card chat-card">
          <Room room={room} />
        </div>
      </section>
    </>
  )
}
