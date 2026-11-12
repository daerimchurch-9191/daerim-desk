// 공지: 관리자가 쓰고, 받는 범위(전체·교구·교육부)에 맞는 사람에게 보인다.
// 누가 어떤 공지를 보는지는 데이터베이스 권한 규칙이 정한다(소속 부서 기준, 관리자는 전부).
import { useEffect, useState } from 'react'
import { supabase, useAuth, toKorean } from './auth.jsx'
import { useData, Modal, ymd } from './live.jsx'

export const AUDIENCES = [
  { id: 'all', name: '전체' },
  { id: 'parish', name: '교구' },
  { id: 'edu', name: '교육부' },
]
const audienceName = (id) => AUDIENCES.find((a) => a.id === id)?.name ?? '전체'
const dateLabel = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}월 ${d.getDate()}일` }
export const isExpired = (n) => Boolean(n.until) && n.until < ymd(new Date())

// 공지 목록과 읽음 표시를 불러온다. DataProvider 의 version 이 바뀌면 다시 불러온다.
export function useNotices() {
  const { version } = useData()
  const [list, setList] = useState(null)
  const [read, setRead] = useState(new Set())
  useEffect(() => {
    supabase.from('notices').select('*').order('created_at', { ascending: false }).limit(100)
      .then(({ data }) => setList(data ?? []))
    supabase.from('notice_reads').select('notice_id')
      .then(({ data }) => setRead(new Set((data ?? []).map((r) => r.notice_id))))
  }, [version])
  const active = (list ?? []).filter((n) => !isExpired(n))
  const unread = active.filter((n) => !read.has(n.id))
  const markRead = async (id) => {
    if (read.has(id)) return
    setRead(new Set([...read, id]))
    await supabase.from('notice_reads').upsert({ notice_id: id }, { onConflict: 'user_id,notice_id', ignoreDuplicates: true })
  }
  return { list, active, unread, isRead: (id) => read.has(id), markRead }
}

/* ---------- 공유: 제목과 내용을 그대로 보낸다 ---------- */
const shareText = (n) => (n.body ? `[대림교회 공지] ${n.title}\n\n${n.body}` : `[대림교회 공지] ${n.title}`)

function ShareButtons({ notice }) {
  const { notify } = useData()
  const text = shareText(notice)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      notify('공지 제목과 내용을 복사했습니다. 단톡방에 붙여 넣으세요.')
    } catch {
      notify('복사하지 못했습니다. 공지 내용을 직접 선택해 복사해 주세요.')
    }
  }
  // 기기 공유 창(카카오톡 등 고르기)을 연다. 지원하지 않는 기기에서는 복사로 대신한다.
  async function share() {
    if (typeof navigator.share !== 'function') return copy()
    try { await navigator.share({ title: notice.title, text }) } catch (e) { if (e?.name !== 'AbortError') copy() }
  }
  return (
    <div className="share-row">
      <button type="button" className="btn btn-dark" onClick={share}>카카오톡 등으로 공유</button>
      <button type="button" className="btn" onClick={copy}>제목과 내용 복사</button>
    </div>
  )
}

/* ---------- 공지 쓰기·고치기 ---------- */
function NoticeEditor({ initial, onClose }) {
  const { refresh, notify } = useData()
  const editing = Boolean(initial?.id)
  const [f, setF] = useState({ title: initial?.title ?? '', body: initial?.body ?? '', audience: initial?.audience ?? 'all', until: initial?.until ?? '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(null)

  async function save(e) {
    e.preventDefault()
    if (!f.title.trim()) return setError('제목을 적어 주세요.')
    const row = { title: f.title.trim(), body: f.body.trim() || null, audience: f.audience, until: f.until || null }
    setBusy(true)
    const res = editing
      ? await supabase.from('notices').update(row).eq('id', initial.id).select().single()
      : await supabase.from('notices').insert(row).select().single()
    setBusy(false)
    if (res.error) return setError(toKorean(res.error.message))
    refresh(); notify(editing ? '공지를 고쳤습니다.' : '공지를 등록했습니다.')
    setSaved(res.data)
  }
  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('notices').delete().eq('id', initial.id)
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    refresh(); notify('공지를 지웠습니다.'); onClose()
  }

  if (saved) {
    return (
      <Modal title="공지가 등록되었습니다" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onClose() }}
        footer={<button type="submit" className="btn btn-primary">닫기</button>}>
        <p><strong>{saved.title}</strong> <span className="chip">{audienceName(saved.audience)}</span></p>
        <p className="muted small">교역자 단톡방에도 알리려면 공유 버튼으로 카카오톡을 고르거나, 복사해서 붙여 넣으세요.</p>
        <ShareButtons notice={saved} />
      </Modal>
    )
  }

  return (
    <Modal title={editing ? '공지 수정' : '공지 작성'} onClose={onClose} onSubmit={save}
      footer={<>
        {editing && <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>삭제</button>}
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : editing ? '저장' : '등록하기'}</button>
      </>}>
      <label className="field">제목<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></label>
      <fieldset className="segment-field">
        <legend>받는 범위</legend>
        <div className="segment">
          {AUDIENCES.map((a) => (
            <label key={a.id} className={f.audience === a.id ? 'is-on' : ''}>
              <input type="radio" name="audience" checked={f.audience === a.id} onChange={() => setF({ ...f, audience: a.id })} />{a.name}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="muted small">교구·교육부 공지는 그 소속 사역자와 관리자에게만 보입니다.</p>
      <label className="field">게시 기간 <small>(이 날까지 보임, 비우면 계속)</small>
        <input type="date" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} />
      </label>
      <label className="field">내용 <small>(선택)</small>
        <textarea rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

/* ---------- 공지 읽기 ---------- */
function NoticeView({ notice, onClose, onEdit }) {
  const { profile } = useAuth()
  return (
    <Modal title="공지" onClose={onClose} onSubmit={(e) => { e.preventDefault(); onClose() }}
      footer={<>
        {profile.role === 'admin' && <button type="button" className="btn" onClick={onEdit}>수정</button>}
        <button type="submit" className="btn btn-primary">닫기</button>
      </>}>
      <h3 className="notice-title">{notice.title}</h3>
      <p className="muted small">{audienceName(notice.audience)} · {dateLabel(notice.created_at)}{notice.until && ` · ${Number(notice.until.slice(5, 7))}월 ${Number(notice.until.slice(8))}일까지`}</p>
      {notice.body ? <p className="notice-body">{notice.body}</p> : <p className="muted">내용 없이 제목만 있는 공지입니다.</p>}
      {profile.role === 'admin' && <ShareButtons notice={notice} />}
    </Modal>
  )
}

export function useNoticeActions(notices) {
  const { openModal } = useData()
  const write = (initial = null) => openModal({ render: (close) => <NoticeEditor initial={initial} onClose={close} /> })
  const view = (n) => {
    notices.markRead(n.id)
    openModal({ render: (close) => <NoticeView notice={n} onClose={close} onEdit={() => { close(); write(n) }} /> })
  }
  return { write, view }
}

/* ---------- 왼쪽 탭 공지 칸 ---------- */
export function SideNotices({ notices, onNavigate }) {
  const { view } = useNoticeActions(notices)
  const latest = notices.active.slice(0, 3)
  return (
    <section className="side-notice" aria-labelledby="notice-h">
      <div className="side-notice-head">
        <h2 id="notice-h" className="side-label">공지</h2>
        {notices.unread.length > 0 && <span className="badge-new">새 글 {notices.unread.length}</span>}
      </div>
      {notices.list === null && <span className="skeleton dark" />}
      {notices.list !== null && latest.length === 0 && <span className="side-empty">지금 올라온 공지가 없습니다.</span>}
      {latest.map((n) => (
        <button key={n.id} type="button" className={`side-notice-item${notices.isRead(n.id) ? '' : ' is-new'}`} onClick={() => view(n)}>
          <strong>{n.title}</strong>
          <span>{audienceName(n.audience)} · {dateLabel(n.created_at)}</span>
        </button>
      ))}
      <a href="#notices" className="side-more" onClick={onNavigate}>공지 전체 보기</a>
    </section>
  )
}

/* ---------- 휴대폰 홈 위쪽: 안 읽은 최신 공지 한 줄 ---------- */
export function NoticeStrip({ notices }) {
  const { view } = useNoticeActions(notices)
  const n = notices.unread[0]
  if (!n) return null
  return (
    <button type="button" className="notice-strip only-mobile" onClick={() => view(n)}>
      <span className="badge-new">새 공지 {notices.unread.length}</span>
      <span className="grow"><strong>{n.title}</strong><small>{audienceName(n.audience)} · {dateLabel(n.created_at)}</small></span>
    </button>
  )
}

/* ---------- 공지 전체 보기 ---------- */
export function NoticesPage({ notices }) {
  const { profile } = useAuth()
  const { write, view } = useNoticeActions(notices)
  const isAdmin = profile.role === 'admin'
  const [showExpired, setShowExpired] = useState(false)
  const rows = (notices.list ?? []).filter((n) => showExpired || !isExpired(n))

  return (
    <>
      <header className="title">
        <h1 className="display page-title">NOTICE</h1>
        <span className="muted">공지 전체 보기{isAdmin ? ' · 관리자는 모든 범위의 공지가 보입니다' : ''}</span>
      </header>
      <section className="block" aria-labelledby="notices-h">
        <div className="block-head">
          <h2 id="notices-h" className="pill">공지 {notices.active.length}</h2>
          <label className="check-inline grow"><input type="checkbox" checked={showExpired} onChange={(e) => setShowExpired(e.target.checked)} />기간 지난 공지도 보기</label>
          {isAdmin && <button type="button" className="btn btn-primary" onClick={() => write()}>+ 공지 작성</button>}
        </div>
        <div className="card">
          {notices.list === null && <span className="skeleton" />}
          {notices.list !== null && rows.length === 0 && (
            <div className="empty">{isAdmin ? '아직 공지가 없습니다. "+ 공지 작성"으로 첫 공지를 올려 보세요.' : '지금 올라온 공지가 없습니다.'}</div>
          )}
          {rows.map((n) => (
            <button key={n.id} type="button" className="notice-row" onClick={() => view(n)}>
              {!notices.isRead(n.id) && !isExpired(n) && <span className="dot-new" aria-label="안 읽음" />}
              <span className="grow">
                <strong>{n.title}</strong>
                <small className="muted">{dateLabel(n.created_at)}{n.until && ` · ${Number(n.until.slice(5, 7))}/${Number(n.until.slice(8))}까지`}</small>
              </span>
              <span className={`chip${n.audience === 'all' ? '' : ' chip-plain'}`}>{audienceName(n.audience)}</span>
              {isExpired(n) && <span className="chip chip-plain">기간 지남</span>}
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
