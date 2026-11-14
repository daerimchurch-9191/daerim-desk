// 관리자 메뉴 (#admin 회원 관리, #admin/perms 권한 관리, #admin/etc 기타: 새벽 담당표 연동·자동 백업): 관리자만
import { useEffect, useState } from 'react'
import { useAuth } from './auth.jsx'
import { AdminPage } from './AdminPage.jsx'
import { PermissionsPage } from './perms.jsx'
import { SheetSyncAdmin } from './sheetsync.jsx'
import { BackupAdmin } from './backup.jsx'
import { NotionSyncAdmin } from './notionsync.jsx'
import { CalendarSyncAdmin } from './calsync.jsx'

const TABS = [
  { id: '', name: '회원 관리' },
  { id: 'perms', name: '권한 관리' },
  { id: 'etc', name: '기타' },
]
const readTab = () => {
  if (location.hash === '#perms') return 'perms'
  const t = location.hash.replace(/^#admin\/?/, '')
  if (t === 'sheet' || t === 'backup') return 'etc'
  return TABS.some((x) => x.id === t) ? t : ''
}

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
      {tab === 'perms' ? <PermissionsPage /> : tab === 'etc' ? <><NotionSyncAdmin /><CalendarSyncAdmin /><SheetSyncAdmin /><BackupAdmin /></> : <AdminPage />}
    </>
  )
}
