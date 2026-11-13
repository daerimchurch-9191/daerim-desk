// 주보 광고: 사역자 누구나 주(주일 날짜)별로 올리고, 담당자가 한 주치를 한 번에 복사해 주보에 붙인다.
import { useEffect, useState } from 'react'
import { supabase, useAuth, toKorean, can } from './auth.jsx'
import { useData, Modal, ymd, addDays, startOfWeek } from './live.jsx'

// 기본은 다가오는 주일 (오늘이 주일이면 오늘)
const nextSunday = () => { const t = new Date(); return t.getDay() === 0 ? startOfWeek(t) : addDays(startOfWeek(t), 7) }
const sunLabel = (d) => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 주일`

function AdModal({ initial, weekOf, onClose, onSaved }) {
  const { notify } = useData()
  const editing = Boolean(initial?.id)
  const [f, setF] = useState({ week_of: initial?.week_of ?? ymd(weekOf), title: initial?.title ?? '', body: initial?.body ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError('') }
  // 주일 날짜 고르기: 앞뒤 8주
  const base = nextSunday()
  const weeks = [...Array(12)].map((_, i) => addDays(base, (i - 3) * 7))
  if (!weeks.some((w) => ymd(w) === f.week_of)) weeks.unshift(new Date(f.week_of + 'T00:00:00'))

  async function save(e) {
    e.preventDefault()
    if (!f.title.trim()) return setError('광고 제목을 적어 주세요.')
    setBusy(true)
    const row = { week_of: f.week_of, title: f.title.trim(), body: f.body.trim() || null }
    const { error } = editing
      ? await supabase.from('bulletin_ads').update(row).eq('id', initial.id)
      : await supabase.from('bulletin_ads').insert(row)
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    notify(editing ? '광고를 고쳤습니다.' : '광고를 올렸습니다.'); onSaved(); onClose()
  }
  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('bulletin_ads').delete().eq('id', initial.id)
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    notify('광고를 지웠습니다.'); onSaved(); onClose()
  }

  return (
    <Modal title={editing ? '광고 고치기' : '주보 광고 올리기'} onClose={onClose} onSubmit={save}
      footer={<>
        {editing && <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>지우기</button>}
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </>}>
      <label className="field">실릴 주보
        <select value={f.week_of} onChange={set('week_of')}>
          {weeks.map((w) => <option key={ymd(w)} value={ymd(w)}>{w.getMonth() + 1}월 {w.getDate()}일 주일</option>)}
        </select>
      </label>
      <label className="field">제목<input value={f.title} onChange={set('title')} placeholder="예: 겨울성경학교 교사 모집" /></label>
      <label className="field"><span>내용 <small>(선택)</small></span><textarea rows={5} value={f.body} onChange={set('body')} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

export const adsText = (week0, list) => [
  `[주보 광고] ${week0.getMonth() + 1}월 ${week0.getDate()}일 주일`,
  ...list.map((a, i) => `${i + 1}. ${a.title}${a.body ? `\n${a.body}` : ''}`),
].join('\n\n')

export function AdsPage() {
  const { profile } = useAuth()
  const { openModal, notify, staff, version } = useData()
  const [week0, setWeek0] = useState(nextSunday())
  const [rows, setRows] = useState(null)
  const [tick, setTick] = useState(0)
  const reload = () => setTick((t) => t + 1)

  useEffect(() => {
    setRows(null)
    supabase.from('bulletin_ads').select('*').eq('week_of', ymd(week0)).order('created_at')
      .then(({ data }) => setRows(data ?? []))
  }, [week0.getTime(), tick, version])

  const nameOf = (id) => { const s = staff.find((p) => p.id === id); return s ? `${s.name} ${s.title}` : '' }
  const canEdit = (a) => a.created_by === profile.id || can(profile, 'ads')
  const write = (initial) => openModal({ render: (close) => <AdModal initial={initial} weekOf={week0} onClose={close} onSaved={reload} /> })
  async function copyAll() {
    try { await navigator.clipboard.writeText(adsText(week0, rows)); notify(`${rows.length}개 광고를 복사했습니다. 주보 파일에 붙여 넣으세요.`) }
    catch { notify('복사하지 못했습니다. 내용을 직접 선택해 복사해 주세요.') }
  }

  return (
    <>
      <header className="title">
        <h1 className="display page-title">BULLETIN</h1>
        <span className="muted">주보 광고 · 주일마다 모아서 한 번에 복사</span>
      </header>
      <section className="block" aria-labelledby="ads-h">
        <div className="block-head">
          <h2 id="ads-h" className="pill">광고 {rows?.length ?? 0}</h2>
          <div className="month-nav">
            <button type="button" className="icon-btn light" aria-label="이전 주" onClick={() => setWeek0(addDays(week0, -7))}>‹</button>
            <button type="button" className="icon-btn light" aria-label="다음 주" onClick={() => setWeek0(addDays(week0, 7))}>›</button>
          </div>
          <button type="button" className="btn btn-primary push-end" onClick={() => write(null)}>+ 광고 올리기</button>
          <strong className="grow">{sunLabel(week0)}</strong>
        </div>
        <div className="card">
          {rows === null && <span className="skeleton" />}
          {rows !== null && rows.length === 0 && <div className="empty">이 주일 주보에 올라온 광고가 없습니다.</div>}
          {(rows ?? []).map((a, i) => (
            <article key={a.id} className="ad-row">
              <span className="ad-no">{i + 1}</span>
              <div className="grow">
                <strong>{a.title}</strong>
                {a.body && <p className="pre">{a.body}</p>}
                <small className="muted">{nameOf(a.created_by)}</small>
              </div>
              {canEdit(a) && <button type="button" className="btn btn-link" onClick={() => write(a)}>고치기</button>}
            </article>
          ))}
          {rows?.length > 0 && <button type="button" className="btn btn-dark btn-block" onClick={copyAll}>이 주 광고 전체 복사</button>}
        </div>
        <p className="note">사역자 누구나 올릴 수 있고, 올린 사람과 광고 정리 권한이 있는 사람이 고칠 수 있습니다. 복사하면 번호를 붙여 "제목 / 내용" 순서로 정리됩니다.</p>
      </section>
    </>
  )
}
