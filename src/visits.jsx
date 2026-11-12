// 심방보고: 관리자가 권한을 준 사람만 들어온다.
// - writer(교구 담당자): 자기가 쓴 보고만 보고 쓴다
// - all(담임목사님): 모든 보고를 본다 (고치기·지우기는 각자 자기 것만)
// 누가 무엇을 보는지는 데이터베이스 권한 규칙(my_visit_role)이 정한다. 화면은 그에 맞춰 보여 줄 뿐이다.
import { useEffect, useState } from 'react'
import { supabase, useAuth, toKorean } from './auth.jsx'
import { useData, Modal, ymd, DOW_KO } from './live.jsx'

export const VISIT_ROLES = { writer: '심방 작성', all: '심방 전체 열람' }
const dLabel = (s) => { const d = new Date(s + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()} (${DOW_KO[d.getDay()]})` }

function VisitModal({ initial, onClose, onSaved }) {
  const { departments, notify } = useData()
  const { profile } = useAuth()
  const editing = Boolean(initial?.id)
  const parishes = departments.filter((d) => d.grp === 'parish')
  const [f, setF] = useState({
    visit_date: initial?.visit_date ?? ymd(new Date()),
    target: initial?.target ?? '',
    dept: initial?.dept ?? (parishes.some((d) => d.name === profile.dept) ? profile.dept : ''),
    companions: initial?.companions ?? '',
    body: initial?.body ?? '',
    prayer: initial?.prayer ?? '',
    follow_up: initial?.follow_up ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError('') }

  async function save(e) {
    e.preventDefault()
    if (!f.target.trim()) return setError('심방한 가정(성도) 이름을 적어 주세요.')
    if (!f.body.trim()) return setError('심방 내용을 적어 주세요.')
    setBusy(true)
    const row = {
      visit_date: f.visit_date, target: f.target.trim(), dept: f.dept || null,
      companions: f.companions.trim() || null, body: f.body.trim(),
      prayer: f.prayer.trim() || null, follow_up: f.follow_up.trim() || null,
    }
    const { error } = editing
      ? await supabase.from('visit_reports').update({ ...row, updated_at: new Date().toISOString() }).eq('id', initial.id)
      : await supabase.from('visit_reports').insert(row)
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    notify(editing ? '심방보고를 고쳤습니다.' : '심방보고를 저장했습니다.')
    onSaved(); onClose()
  }

  async function remove() {
    setBusy(true)
    const { error } = await supabase.from('visit_reports').delete().eq('id', initial.id)
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    notify('심방보고를 지웠습니다.'); onSaved(); onClose()
  }

  return (
    <Modal title={editing ? '심방보고 고치기' : '심방보고 쓰기'} onClose={onClose} onSubmit={save}
      footer={<>
        {editing && <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>지우기</button>}
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </>}>
      <div className="field-row">
        <label className="field">심방 날짜<input type="date" value={f.visit_date} onChange={set('visit_date')} required /></label>
        <label className="field"><span>교구 <small>(선택)</small></span>
          <select value={f.dept} onChange={set('dept')}>
            <option value="">고르지 않음</option>
            {parishes.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
        </label>
      </div>
      <label className="field">심방 가정·성도<input value={f.target} onChange={set('target')} placeholder="예: 김OO 성도 가정" /></label>
      <label className="field"><span>함께 간 사람 <small>(선택)</small></span><input value={f.companions} onChange={set('companions')} placeholder="예: 구역장 이OO" /></label>
      <label className="field">심방 내용<textarea rows={6} value={f.body} onChange={set('body')} /></label>
      <label className="field"><span>기도제목 <small>(선택)</small></span><textarea rows={3} value={f.prayer} onChange={set('prayer')} /></label>
      <label className="field"><span>후속 조치 <small>(선택)</small></span><input value={f.follow_up} onChange={set('follow_up')} placeholder="예: 다음 주 전화 심방" /></label>
      <p className="muted small">주민번호·연락처·주소는 적지 말아 주세요. 연락처와 주소는 디모데에서 확인합니다.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

export function VisitsPage() {
  const { profile } = useAuth()
  const { openModal, staff, version } = useData()
  const role = profile.visit_role
  const [rows, setRows] = useState(null)
  const [tick, setTick] = useState(0)
  const [q, setQ] = useState('')
  const [who, setWho] = useState('all')
  const [open, setOpen] = useState(null)
  const reload = () => setTick((t) => t + 1)

  useEffect(() => {
    if (!role) return
    setRows(null)
    supabase.from('visit_reports').select('*').order('visit_date', { ascending: false }).order('id', { ascending: false }).limit(500)
      .then(({ data }) => setRows(data ?? []))
  }, [role, tick, version])

  if (!role) {
    return (
      <>
        <header className="title"><h1 className="display page-title">VISITS</h1><span className="muted">심방보고</span></header>
        <div className="card"><div className="empty">심방보고는 권한을 받은 사역자만 볼 수 있습니다. 필요하면 관리자에게 요청해 주세요.</div></div>
      </>
    )
  }

  const nameOf = (id) => { const s = staff.find((p) => p.id === id); return s ? `${s.name} ${s.title}` : '' }
  const writers = [...new Set((rows ?? []).map((r) => r.created_by))]
  const term = q.trim()
  const shown = (rows ?? [])
    .filter((r) => who === 'all' || r.created_by === who)
    .filter((r) => !term || [r.target, r.dept, r.body, r.prayer, r.follow_up, r.companions].some((v) => v?.includes(term)))
  const write = (initial) => openModal({ render: (close) => <VisitModal initial={initial} onClose={close} onSaved={reload} /> })

  return (
    <>
      <header className="title">
        <h1 className="display page-title">VISITS</h1>
        <span className="muted">심방보고 · {role === 'all' ? '모든 사역자의 보고가 보입니다' : '내가 쓴 보고만 보입니다'}</span>
      </header>
      <section className="block" aria-labelledby="visits-h">
        <div className="block-head">
          <h2 id="visits-h" className="pill">심방 {shown.length}</h2>
          <button type="button" className="btn btn-primary push-end" onClick={() => write(null)}>+ 심방보고 쓰기</button>
        </div>
        <div className="visit-filters">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·내용 찾기" aria-label="심방보고 찾기" />
          {role === 'all' && writers.length > 1 && (
            <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="작성자">
              <option value="all">모든 작성자</option>
              {writers.map((id) => <option key={id} value={id}>{nameOf(id) || '이름 없음'}</option>)}
            </select>
          )}
        </div>
        <div className="card">
          {rows === null && <span className="skeleton" />}
          {rows !== null && shown.length === 0 && (
            <div className="empty">{rows.length === 0 ? '아직 심방보고가 없습니다. "+ 심방보고 쓰기"로 시작해 보세요.' : '찾는 보고가 없습니다.'}</div>
          )}
          {shown.map((r) => {
            const mine = r.created_by === profile.id
            const isOpen = open === r.id
            return (
              <article key={r.id} className="visit-row">
                <button type="button" className="visit-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}>
                  <span className="visit-date">{dLabel(r.visit_date)}</span>
                  <span className="grow">
                    <strong>{r.target}</strong>
                    <small className="muted">{[r.dept, !mine && nameOf(r.created_by)].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className="muted small" aria-hidden="true">{isOpen ? '접기' : '펼치기'}</span>
                </button>
                {isOpen && (
                  <div className="visit-body">
                    {r.companions && <p><b>함께 간 사람</b> {r.companions}</p>}
                    <p className="pre">{r.body}</p>
                    {r.prayer && <><b>기도제목</b><p className="pre">{r.prayer}</p></>}
                    {r.follow_up && <p><b>후속 조치</b> {r.follow_up}</p>}
                    <p className="muted small">{nameOf(r.created_by)} 작성{r.updated_at && r.updated_at.slice(0, 16) !== r.created_at.slice(0, 16) ? ' · 고침' : ''}</p>
                    {mine && <button type="button" className="btn" onClick={() => write(r)}>고치기</button>}
                  </div>
                )}
              </article>
            )
          })}
        </div>
        <p className="note">심방보고는 권한을 받은 사역자만 열 수 있고, 교구 담당자는 자기가 쓴 보고만 봅니다. 권한은 관리자가 회원 관리에서 줍니다.</p>
      </section>
    </>
  )
}
