// 관리자 메뉴 → 기타: 노션 "차량신청" 연동 상태. 연동은 서버(notion-car-sync)가 5분마다 + 대시보드에서 바뀔 때마다 한다.
import { useEffect, useState } from 'react'
import { supabase } from './auth.jsx'
import { useData } from './live.jsx'

export function NotionSyncAdmin() {
  const { notify } = useData()
  const [meta, setMeta] = useState(null)
  const [issues, setIssues] = useState(null)
  const load = () => {
    supabase.from('notion_sync_meta').select('*').maybeSingle().then(({ data }) => setMeta(data ?? {}))
    supabase.from('notion_sync_issues').select('*').order('at', { ascending: false }).limit(50).then(({ data }) => setIssues(data ?? []))
  }
  useEffect(load, [])
  async function clear(id) {
    const q = supabase.from('notion_sync_issues').delete()
    const { error } = id ? await q.eq('id', id) : await q.gt('id', 0)
    if (!error) { notify(id ? '확인했습니다.' : '목록을 비웠습니다.'); load() }
  }
  const mins = meta?.last_run ? Math.round((Date.now() - new Date(meta.last_run)) / 60000) : null

  return (
    <section className="block" aria-labelledby="notion-h">
      <h2 id="notion-h" className="pill">노션 차량신청 연동</h2>
      <div className="card backup-card">
        <p className="backup-status">
          {meta === null ? '확인하는 중…'
            : !meta.last_run ? '아직 연결되지 않았습니다.'
              : <><b>마지막 확인</b> {new Date(meta.last_run).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}
                {mins > 30 && <span className="chip chip-warn">30분 넘게 연락이 없습니다</span>}
                {meta.last_error && <span className="chip chip-warn">오류: {meta.last_error}</span>}</>}
        </p>
        <p className="muted small">노션에 들어온 신청은 5분 안에 대시보드에, 대시보드에서 신청·수정·취소한 것은 바로 노션에 반영됩니다. 같은 신청을 양쪽에서 동시에 고치면 노션 쪽이 남습니다. 어제 이후 일정만 맞춥니다.</p>
        {issues?.length > 0 && (
          <div className="sync-issues">
            <div className="sync-issues-head"><b>가져오지 못한 신청 {issues.length}</b><button type="button" className="btn-link small" onClick={() => clear(null)}>모두 확인</button></div>
            <ul>
              {issues.map((i) => (
                <li key={i.id}><span>{i.message}</span><button type="button" className="btn-link small" onClick={() => clear(i.id)}>확인</button></li>
              ))}
            </ul>
            <p className="muted small">시간이 겹치는 신청은 노션에서 시간이나 차량을 고치면 다음 확인 때 들어옵니다.</p>
          </div>
        )}
      </div>
    </section>
  )
}
