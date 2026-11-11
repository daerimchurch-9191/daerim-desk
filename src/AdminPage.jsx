import { useEffect, useState } from 'react'
import { supabase, useAuth, toKorean } from './auth.jsx'
import { VehicleAdmin } from './live.jsx'

const STATUS = { pending: '승인 대기', approved: '승인됨', rejected: '반려됨' }

export function AdminPage() {
  const { profile: me } = useAuth()
  const [people, setPeople] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at')
    if (error) setError(toKorean(error.message))
    setPeople(data ?? [])
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
  const others = people?.filter((p) => p.status !== 'pending') ?? []

  const row = (p) => (
    <div key={p.id} className="member-row">
      <div className="grow">
        <strong>{p.name} {p.title}</strong>
        <span className="muted small"> · {p.login_id}{p.dept ? ` · ${p.dept}` : ''}</span>
      </div>
      <span className={`chip${p.status === 'approved' ? '' : ' chip-plain'}`}>{STATUS[p.status]}{p.role === 'admin' ? ' · 관리자' : ''}</span>
      {p.status !== 'approved' && <button type="button" className="btn btn-primary" onClick={() => update(p.id, { status: 'approved' })}>승인</button>}
      {p.status === 'pending' && <button type="button" className="btn" onClick={() => update(p.id, { status: 'rejected' })}>반려</button>}
      {p.status === 'approved' && p.id !== me.id && (
        p.role === 'admin'
          ? <button type="button" className="btn" onClick={() => update(p.id, { role: 'member' })}>관리자 해제</button>
          : <button type="button" className="btn" onClick={() => update(p.id, { role: 'admin' })}>관리자로 지정</button>
      )}
    </div>
  )

  return (
    <>
      <header className="title">
        <h1 className="display page-title">MEMBERS</h1>
        <span className="muted">회원 관리 · 가입 승인, 관리자 지정, 차량 등록</span>
      </header>
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
      <VehicleAdmin />
    </>
  )
}
