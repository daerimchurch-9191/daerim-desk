// 권한 관리 (관리자만): 사람마다 권한을 체크하고 "저장"으로 한 번에 반영한다.
// 실제로 막는 것은 데이터베이스 권한 규칙이다(has_perm, is_admin). 이 화면은 체크 표시를 저장할 뿐이다.
import { useEffect, useMemo, useState } from 'react'
import { supabase, useAuth, toKorean, PERMS } from './auth.jsx'
import { useData } from './live.jsx'

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x))

export function PermissionsPage() {
  const { profile: me, reloadProfile } = useAuth()
  const { departments, notify, refresh } = useData()
  const [people, setPeople] = useState(null)
  const [draft, setDraft] = useState({}) // id -> { admin, perms[] }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const parishes = departments.filter((d) => d.grp === 'parish')

  const columns = useMemo(() => [
    { key: 'admin', name: '관리자', hint: '회원 관리·권한 관리, 공지·차량·광고 권한 모두 포함 (심방방은 따로)', group: '관리' },
    ...PERMS.map((p) => ({ ...p, group: '관리' })),
    { key: 'visit_all', name: '모든 교구', hint: '모든 교구 심방방 열람·작성 (담임목사님)', group: '심방방' },
    ...parishes.map((d) => ({ key: `visit:${d.id}`, name: d.name, hint: `${d.name} 심방방 열람·작성`, group: '심방방' })),
  ], [parishes.length])

  async function load() {
    const { data, error } = await supabase.from('profiles').select('id, name, title, dept, role, perms, status').eq('status', 'approved').order('name')
    if (error) return setError(toKorean(error.message))
    setPeople(data)
    setDraft(Object.fromEntries(data.map((p) => [p.id, { admin: p.role === 'admin', perms: p.perms ?? [] }])))
  }
  useEffect(() => { load() }, [])

  const has = (id, key) => key === 'admin' ? draft[id]?.admin : draft[id]?.perms.includes(key)
  function toggle(id, key) {
    if (key === 'admin' && id === me.id) return setError('내 관리자 권한은 스스로 해제할 수 없습니다. 다른 관리자에게 부탁해 주세요.')
    setError('')
    setDraft((d) => {
      const cur = d[id]
      if (key === 'admin') return { ...d, [id]: { ...cur, admin: !cur.admin } }
      const perms = cur.perms.includes(key) ? cur.perms.filter((x) => x !== key) : [...cur.perms, key]
      return { ...d, [id]: { ...cur, perms } }
    })
  }
  const changed = (people ?? []).filter((p) => draft[p.id] && ((p.role === 'admin') !== draft[p.id].admin || !sameSet(p.perms ?? [], draft[p.id].perms)))

  async function save() {
    setBusy(true); setError('')
    for (const p of changed) {
      const d = draft[p.id]
      const { error } = await supabase.from('profiles').update({ role: d.admin ? 'admin' : 'member', perms: d.perms }).eq('id', p.id)
      if (error) { setBusy(false); setError(`${p.name} ${p.title}님 권한을 저장하지 못했습니다. ${toKorean(error.message)}`); return load() }
    }
    setBusy(false)
    notify(`${changed.length}명의 권한을 저장했습니다.`)
    if (changed.some((p) => p.id === me.id)) reloadProfile()
    refresh(); load()
  }

  // 화면을 떠날 때 저장 안 한 변경이 있으면 묻는다
  useEffect(() => {
    if (!changed.length) return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [changed.length])

  if (me.role !== 'admin') return <div className="card"><div className="empty">권한 관리는 관리자만 볼 수 있습니다.</div></div>

  return (
    <>
      <header className="title">
        <h1 className="display page-title">PERMISSIONS</h1>
        <span className="muted">권한 관리 · 체크한 뒤 "저장"을 눌러야 반영됩니다</span>
      </header>
      <section className="block" aria-labelledby="perm-h">
        <div className="block-head">
          <h2 id="perm-h" className="pill">사역자 {people?.length ?? 0}</h2>
          {changed.length > 0 && <span className="chip chip-warn">저장 안 한 변경 {changed.length}명</span>}
          <button type="button" className="btn push-end" disabled={!changed.length || busy} onClick={load}>되돌리기</button>
          <button type="button" className="btn btn-primary" disabled={!changed.length || busy} onClick={save}>{busy ? '저장 중…' : '저장'}</button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="card perm-card">
          {people === null ? <span className="skeleton" /> : (
            <table className="perm-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="perm-name">사역자</th>
                  <th colSpan={1 + PERMS.length} className="perm-group">관리</th>
                  <th colSpan={1 + parishes.length} className="perm-group">심방방</th>
                </tr>
                <tr>{columns.map((c) => <th key={c.key} title={c.hint}>{c.name}</th>)}</tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const dirty = changed.includes(p)
                  return (
                    <tr key={p.id} className={dirty ? 'is-dirty' : ''}>
                      <th scope="row" className="perm-name"><strong>{p.name} {p.title}</strong><small className="muted">{p.dept || '소속 없음'}</small></th>
                      {columns.map((c) => {
                        const on = has(p.id, c.key)
                        const implied = c.key !== 'admin' && !c.key.startsWith('visit') && draft[p.id]?.admin
                        const viaAll = c.key.startsWith('visit:') && has(p.id, 'visit_all')
                        return (
                          <td key={c.key} data-label={c.name} data-group={c.group}>
                            <input type="checkbox" checked={on || implied || viaAll} disabled={implied || viaAll}
                              aria-label={`${p.name} ${c.name}`} onChange={() => toggle(p.id, c.key)} />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <ul className="note perm-legend">
          {columns.map((c) => <li key={c.key}><b>{c.name}</b> {c.hint}</li>)}
          <li>흐린 체크는 다른 권한에 이미 포함된 것입니다 (관리자 → 공지·차량·광고, 모든 교구 → 각 교구).</li>
        </ul>
      </section>
    </>
  )
}
