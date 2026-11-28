// 심방보고: 교구마다 방이 하나씩 있고, 채팅처럼 심방 내용을 주고받는다.
// - 권한 관리에서 "모든 교구"(담임목사님)를 받으면 모든 방, "1교구" 등을 받으면 그 방만 들어간다.
// - 누가 어느 방을 보는지는 데이터베이스 권한 규칙(has_perm)이 정한다. 화면은 그에 맞춰 보여 줄 뿐이다.
// - 고치기·지우기는 자기가 쓴 글만.
// - 화면(2026-11-28): 페이지는 스크롤하지 않고 대화창이 화면 높이를 꽉 채운다. 교구 버튼은 제목 오른쪽, 검색은 돋보기를 누르면 열린다.
//   대상 칸·대상별 보기·양식 넣기는 없앴다(예전 글의 target 값은 검색에만 쓰인다).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase, useAuth, toKorean, visitRooms } from './auth.jsx'
import { useData, DOW_KO, hm, ymd } from './live.jsx'

const PAGE = 150
const dayLabel = (d) => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW_KO[d.getDay()]}요일`
const touch = () => window.matchMedia('(pointer: coarse)').matches
const clean = (q) => q.replace(/[,()%*\\]/g, ' ').trim()

function Room({ room, searchOpen, closeSearch }) {
  const { profile } = useAuth()
  const { staff, notify } = useData()
  const [msgs, setMsgs] = useState(null)
  const [more, setMore] = useState(false)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [view, setView] = useState({ mode: 'chat' }) // chat | search(q)
  const [found, setFound] = useState(null)
  const searchRef = useRef(null)
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
    setMsgs(null); setEditing(null); setText(''); setQ(''); setView({ mode: 'chat' }); stick.current = true; firstLoad.current = true
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
  async function runSearch(e) {
    e?.preventDefault()
    const term = clean(q)
    if (!term) return setView({ mode: 'chat' })
    setView({ mode: 'search', q: term }); setFound(null)
    const { data, error } = await supabase.from('visit_messages').select('*').eq('dept_id', room.id)
      .or(`body.ilike.%${term}%,target.ilike.%${term}%`).order('created_at', { ascending: false }).limit(300)
    if (error) return setError(toKorean(error.message))
    setFound(data ?? [])
  }
  const backToChat = () => { setView({ mode: 'chat' }); setQ(''); setFound(null); stick.current = true; fetchLatest() }
  // 돋보기를 누르면 검색창이 열리고, 닫으면 대화로 돌아간다
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
    else if (view.mode !== 'chat') backToChat()
  }, [searchOpen])

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !touch()) { e.preventDefault(); send() }
  }

  let lastDay = ''
  return (
    <div className="chat">
      {searchOpen && (
        <form className="chat-tools chat-search" onSubmit={runSearch} role="search">
          <input ref={searchRef} type="search" value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value && view.mode !== 'chat') backToChat() }} placeholder="내용·이름 검색" aria-label={`${room.name} 심방보고 검색`} />
          <button type="submit" className="btn">검색</button>
          <button type="button" className="btn" onClick={closeSearch}>닫기</button>
        </form>
      )}
      {view.mode === 'search' && (
        <div className="chat-results">
          <div className="chat-results-head">
            <button type="button" className="btn-link" onClick={backToChat}>‹ 대화로 돌아가기</button>
            <strong>"{view.q}" 검색 결과</strong>
            {found && <span className="muted small">{found.length}건</span>}
          </div>
          {found === null ? <span className="skeleton" /> : found.length === 0
            ? <div className="empty">찾는 내용이 없습니다.</div>
            : found.map((m) => (
              <article key={m.id} className="result-item">
                <div className="result-meta"><b>{dayLabel(new Date(m.created_at))}</b> · {nameOf(m.created_by)}</div>
                <p className="pre">{m.body}</p>
              </article>
            ))}
        </div>
      )}
      <div className="chat-list" ref={listRef} onScroll={onScroll} aria-live="polite" hidden={view.mode !== 'chat'}>
        {msgs === null && <span className="skeleton" />}
        {more && <button type="button" className="btn btn-link chat-more" onClick={loadOlder}>이전 글 더 보기</button>}
        {msgs?.length === 0 && <div className="empty">{room.name} 심방보고가 비어 있습니다. 첫 심방 내용을 남겨 보세요.</div>}
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
                    <button type="button" onClick={() => { setEditing(m); setText(m.body); closeSearch() }}>고치기</button>
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
        <div className="chat-row">
          <textarea value={text} rows={Math.min(6, Math.max(1, text.split('\n').length))} onChange={(e) => { setText(e.target.value); setError('') }} onKeyDown={onKey}
            placeholder={`${room.name}에 심방 내용 남기기`} title={touch() ? undefined : 'Enter 보내기 · Shift+Enter 줄바꿈'} aria-label="심방 내용" />
          <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>{busy ? '…' : editing ? '고치기' : '보내기'}</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </div>
  )
}

// 대화창 높이를 지금 보이는 화면에 맞춘다 (휴대폰 키보드가 올라와도 입력칸이 보이게)
function useFitHeight(ref) {
  useLayoutEffect(() => {
    const html = document.documentElement
    html.classList.add('page-lock')
    const fit = () => {
      const el = ref.current
      if (!el) return
      const vv = window.visualViewport
      const visBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
      const keyboard = vv && window.innerHeight - vv.height > 150
      const tabs = document.querySelector('.phone-tabs')
      const tabsH = !keyboard && tabs && getComputedStyle(tabs).display !== 'none' ? tabs.getBoundingClientRect().height : 0
      const gap = tabsH ? tabsH + 10 : keyboard ? 6 : 20
      el.style.height = Math.max(260, visBottom - el.getBoundingClientRect().top - gap) + 'px'
    }
    fit()
    const vv = window.visualViewport
    window.addEventListener('resize', fit); vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit)
    const t = setTimeout(fit, 300)
    return () => {
      html.classList.remove('page-lock')
      window.removeEventListener('resize', fit); vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit); clearTimeout(t)
    }
  }, [])
}

export function VisitsPage() {
  const { profile } = useAuth()
  const { departments } = useData()
  const rooms = visitRooms(profile, departments)
  const [roomId, setRoomId] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const cardRef = useRef(null)
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0]

  if (!rooms.length) {
    return (
      <>
        <header className="title"><h1 className="page-title page-title-ko">심방보고</h1></header>
        <div className="card"><div className="empty">볼 수 있는 심방보고가 없습니다. 관리자에게 권한을 요청해 주세요.</div></div>
      </>
    )
  }
  return <VisitsRooms rooms={rooms} room={room} setRoomId={setRoomId} searchOpen={searchOpen} setSearchOpen={setSearchOpen} cardRef={cardRef} />
}

function VisitsRooms({ rooms, room, setRoomId, searchOpen, setSearchOpen, cardRef }) {
  useFitHeight(cardRef)
  return (
    <section className="visit-page" aria-label="심방보고">
      <header className="title visit-title">
        <h1 className="page-title page-title-ko">심방보고</h1>
        <div className="tabs visit-rooms" role="tablist">
          {rooms.map((r) => (
            <button key={r.id} type="button" role="tab" aria-selected={r.id === room.id} className={`tab${r.id === room.id ? ' is-on' : ''}`} onClick={() => setRoomId(r.id)}>{r.name}</button>
          ))}
        </div>
        <button type="button" className={`icon-btn light visit-search-btn${searchOpen ? ' is-on' : ''}`} aria-label="검색" aria-pressed={searchOpen} onClick={() => setSearchOpen((o) => !o)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </button>
      </header>
      <div className="card chat-card" ref={cardRef}>
        <Room room={room} searchOpen={searchOpen} closeSearch={() => setSearchOpen(false)} />
      </div>
    </section>
  )
}
