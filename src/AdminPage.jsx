import { useEffect, useState } from 'react'
import { supabase, useAuth, toKorean, withDepts } from './auth.jsx'
import { useData, Modal, DeptChecks, deptNames, RANKS, keepDeptsForRank } from './live.jsx'

// 관리자가 다른 사역자의 비밀번호를 새로 정해 준다 (Supabase 함수 reset-password)
function ResetPasswordModal({ person, onClose }) {
  const { notify } = useData()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e) {
    e.preventDefault()
    if (pw.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.')
    if (pw !== pw2) return setError('비밀번호 확인이 맞지 않습니다.')
    setBusy(true)
    const { error } = await supabase.functions.invoke('reset-password', { body: { user_id: person.id, password: pw } })
    setBusy(false)
    if (error) {
      let msg = error.message
      try { msg = (await error.context.json()).error ?? msg } catch { /* 본문 없음 */ }
      return setError(msg)
    }
    notify(`${person.name} ${person.title}님의 비밀번호를 바꿨습니다.`); onClose()
  }
  return (
    <Modal title="비밀번호 초기화" onClose={onClose} onSubmit={save}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '바꾸는 중…' : '바꾸기'}</button>
      </>}>
      <p><strong>{person.name} {person.title}</strong> <span className="muted small">· 아이디 {person.login_id}</span></p>
      <label className="field">새 비밀번호<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus /></label>
      <label className="field">새 비밀번호 확인<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></label>
      <p className="muted small">바꾼 비밀번호를 본인에게 직접 알려 주세요. 본인은 로그인한 뒤 톱니 메뉴의 "비밀번호 변경"에서 다시 바꿀 수 있습니다.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

// 로그인한 본인이 자기 비밀번호를 바꾼다
export function ChangePasswordModal({ onClose }) {
  const { notify } = useData()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e) {
    e.preventDefault()
    if (pw.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.')
    if (pw !== pw2) return setError('비밀번호 확인이 맞지 않습니다.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    notify('비밀번호를 바꿨습니다.'); onClose()
  }
  return (
    <Modal title="비밀번호 변경" onClose={onClose} onSubmit={save}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '바꾸는 중…' : '바꾸기'}</button>
      </>}>
      <label className="field">새 비밀번호<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus /></label>
      <label className="field">새 비밀번호 확인<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

const STATUS = { pending: '승인 대기', approved: '승인됨', rejected: '반려됨', inactive: '사용 중지' }

// 교회를 떠난 사역자: 계정과 기록은 남기고 로그인해도 아무것도 볼 수 없게 한다
// 사역자 정보 고치기: 이름·직분·부서 (부서는 공지 받는 범위를 정하므로 관리자만)
function EditMemberModal({ person, onClose, onDone }) {
  const { departments } = useData()
  const [f, setF] = useState({ name: person.name ?? '', rank: person.rank ?? '', dept_ids: person.dept_ids ?? [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setError('') }
  async function save(e) {
    e.preventDefault()
    if (!f.name.trim()) return setError('이름을 적어 주세요.')
    setBusy(true)
    const r1 = await supabase.rpc('set_member_depts', { member: person.id, depts: f.dept_ids })
    const { error } = r1.error ? r1 : await supabase.from('profiles').update({ name: f.name.trim(), rank: f.rank || null }).eq('id', person.id)
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    onDone(); onClose()
  }
  return (
    <Modal title="사역자 정보 고치기" onClose={onClose} onSubmit={save}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>취소</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '저장 중…' : '저장'}</button>
      </>}>
      <p className="muted small">아이디 {person.login_id}</p>
      <div className="field-row">
        <label className="field">이름<input value={f.name} onChange={set('name')} /></label>
        <label className="field">직분
          <select value={f.rank} onChange={(e) => { setF({ ...f, rank: e.target.value, dept_ids: keepDeptsForRank(e.target.value, f.dept_ids, departments) }); setError('') }}>
            <option value="">고르기</option>
            {RANKS.map((r) => <option key={r} value={r}>{r}{r === '부목사' ? ' (호칭: 목사)' : ''}</option>)}
          </select>
        </label>
      </div>
      <DeptChecks key={f.rank} departments={departments} rank={f.rank} value={f.dept_ids} onChange={(v) => { setF({ ...f, dept_ids: v }); setError('') }} />
      <p className="muted small">부서를 바꾸면 받는 공지 범위(교구·교육부)도 함께 바뀝니다. 여러 부서를 맡으면 모두 체크하세요. 심방보고 방은 권한 관리에서 따로 바꿔 주세요.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

function DeactivateModal({ person, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ status: 'inactive', role: 'member' }).eq('id', person.id)
    setBusy(false)
    if (error) return setError(toKorean(error.message))
    onDone(); onClose()
  }
  return (
    <Modal title="사용 중지" onClose={onClose} onSubmit={save}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>닫기</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? '처리 중…' : '사용 중지'}</button>
      </>}>
      <p><strong>{person.name} {person.title}</strong>님의 계정을 사용 중지합니다.</p>
      <p className="muted small">로그인해도 대시보드를 볼 수 없게 됩니다. 이분이 등록한 일정·설교·차량 기록은 그대로 남습니다. 필요하면 아래 "사용 중지된 계정"에서 언제든 다시 사용하게 할 수 있습니다.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Modal>
  )
}

export function AdminPage() {
  const { profile: me, reloadProfile } = useAuth()
  const f = (p) => `${p.name} ${p.title ?? ''}님`
  const { openModal, refresh, notify, departments } = useData()
  const [people, setPeople] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    const { data, error } = await supabase.from('profiles').select('*, profile_depts(dept_id)').order('created_at')
    if (error) setError(toKorean(error.message))
    setPeople((data ?? []).map(withDepts))
  }
  useEffect(() => { load() }, [])

  async function update(id, patch) {
    setError('')
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) setError(toKorean(error.message))
    load()
  }

  if (me?.role !== 'admin') return <p className="card">관리자만 볼 수 있는 화면입니다.</p>
  const pending = people?.filter((p) => p.status === 'pending') ?? []
  const others = people?.filter((p) => p.status === 'approved' || p.status === 'rejected') ?? []
  const inactive = people?.filter((p) => p.status === 'inactive') ?? []

  const row = (p) => (
    <div key={p.id} className="member-row">
      <div className="grow">
        <strong>{p.name} {p.title}</strong>
        <span className="muted small"> · {p.login_id}{p.dept_ids.length ? ` · ${deptNames(p.dept_ids, departments)}` : ''}</span>
      </div>
      <span className={`chip${p.status === 'approved' ? '' : ' chip-plain'}`}>{STATUS[p.status]}{p.role === 'admin' ? ' · 관리자' : ''}</span>
      {p.status === 'inactive' && <button type="button" className="btn btn-primary" onClick={async () => { await update(p.id, { status: 'approved' }); refresh(); notify(`${p.name} ${p.title}님 계정을 다시 쓸 수 있게 했습니다.`) }}>다시 사용</button>}
      {(p.status === 'pending' || p.status === 'rejected') && <button type="button" className="btn btn-primary" onClick={() => update(p.id, { status: 'approved' })}>승인</button>}
      {p.status === 'pending' && <button type="button" className="btn" onClick={() => update(p.id, { status: 'rejected' })}>반려</button>}
      {p.status !== 'inactive' && (
        <button type="button" className="btn" onClick={() => openModal({ render: (close) => <EditMemberModal person={p} onClose={close} onDone={() => { load(); refresh(); if (p.id === me.id) reloadProfile(); notify(`${f(p)} 정보를 고쳤습니다.`) }} /> })}>정보 수정</button>
      )}
      {p.status === 'approved' && p.id !== me.id && (
        <button type="button" className="btn" onClick={() => openModal({ render: (close) => <ResetPasswordModal person={p} onClose={close} /> })}>비밀번호 초기화</button>
      )}
      {p.status === 'approved' && p.id !== me.id && (
        <button type="button" className="btn btn-danger" onClick={() => openModal({ render: (close) => <DeactivateModal person={p} onClose={close} onDone={() => { load(); refresh(); notify(`${p.name} ${p.title}님 계정을 사용 중지했습니다.`) }} /> })}>사용 중지</button>
      )}
    </div>
  )

  return (
    <>
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="block" aria-labelledby="pending-h">
        <h2 id="pending-h" className="pill">승인 대기 {pending.length}</h2>
        <div className="card">
          {people === null ? <p className="muted">불러오는 중…</p>
            : pending.length ? pending.map(row) : <p className="muted">기다리는 가입 신청이 없습니다.</p>}
        </div>
      </section>
      <section className="block" aria-labelledby="all-h">
        <h2 id="all-h" className="pill">사역자 {others.length}</h2>
        <div className="card">{others.map(row)}</div>
      </section>
      {inactive.length > 0 && (
        <section className="block" aria-labelledby="inactive-h">
          <h2 id="inactive-h" className="pill">사용 중지된 계정 {inactive.length}</h2>
          <div className="card">{inactive.map(row)}</div>
        </section>
      )}
    </>
  )
}
