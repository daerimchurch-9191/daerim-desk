// 관리자 메뉴 (#admin, #admin/perms, #admin/sheet, #admin/backup): 관리자만
import { useEffect, useState } from 'react'
import { useAuth } from './auth.jsx'
import { AdminPage } from './AdminPage.jsx'
import { PermissionsPage } from './perms.jsx'
import { SheetSyncAdmin } from './sheetsync.jsx'
import { BackupAdmin } from './backup.jsx'

const TABS = [
  { id: '', name: '회원 관리' },
  { id: 'perms', name: '권한 관리' },
  { id: 'sheet', name: '새벽 담당표 연동' },
  { id: 'backup', name: '자동 백업' },
]
const readTab = () => { if (location.hash === '#perms') return 'perms'; const t = location.hash.replace(/^#admin\/?/, ''); return TABS.some((x) => x.id === t) ? t : '' }

export function AdminHub() {
  const { profile } = useAuth()
  const [tab, setTab] = useState(readTab)
  useEffect(() => {
    const on = () => setTab(readTab())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  if (profile.role !== 'admin') return <div className="card"><div className="empty">관리자 메뉴는 관리자만 볼 수 있습니다.</div></div>
  return (
    <>
      <header className="title">
        <h1 className="display page-title">ADMIN</h1>
        <span className="muted">관리자 메뉴</span>
      </header>
      <nav className="tabs admin-tabs" aria-label="관리자 메뉴">
        {TABS.map((t) => (
          <a key={t.id} href={t.id ? `#admin/${t.id}` : '#admin'} className={`tab${tab === t.id ? ' is-on' : ''}`} aria-current={tab === t.id ? 'page' : undefined}>{t.name}</a>
        ))}
      </nav>
      {tab === 'perms' ? <PermissionsPage /> : tab === 'sheet' ? <SheetSyncAdmin /> : tab === 'backup' ? <BackupAdmin /> : <AdminPage />}
    </>
  )
}
