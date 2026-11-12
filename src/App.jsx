import { useEffect, useState } from 'react'
import { useAuth } from './auth.jsx'
import { LoginPage, WaitingPage } from './LoginPage.jsx'
import { AdminPage, ChangePasswordModal } from './AdminPage.jsx'
import { DataProvider, useData, WeekCalendar, CarsWeek, CarsMonth, DOW_KO } from './live.jsx'
import { MySermons, SermonTable, SermonsMonth } from './sermons.jsx'
import { Todos, Folders } from './personal.jsx'
import { links } from './data.js'
import { useNotices, SideNotices, NoticeStrip, NoticesPage } from './notices.jsx'

const logoWhite = new URL('../public/logo-white.png', import.meta.url).href

const ICONS = {
  globe: <><circle cx="10" cy="10" r="7.5" /><path d="M2.5 10h15M10 2.5c2.6 2.6 2.6 12.4 0 15M10 2.5c-2.6 2.6-2.6 12.4 0 15" /></>,
  video: <><rect x="2.5" y="4" width="15" height="12" rx="2" /><path d="M8.3 7.6v4.8l4.2-2.4z" /></>,
  camera: <><path d="M2.5 6.5h3.3L7 4.5h6l1.2 2h3.3v9.5h-15z" /><circle cx="10" cy="11" r="2.8" /></>,
  people: <><circle cx="8" cy="7" r="3" /><path d="M2.5 16.5c.6-3 2.7-4.5 5.5-4.5s4.9 1.5 5.5 4.5M13.5 4.4a3 3 0 0 1 0 5.2M15.5 12.4c1.3.7 2 2 2.3 4.1" /></>,
  server: <><rect x="3" y="3.5" width="14" height="5.5" rx="1.5" /><rect x="3" y="11" width="14" height="5.5" rx="1.5" /><path d="M6 6.2h.01M6 13.7h.01" /></>,
  doc: <path d="M5 2.5h7l3.5 3.5v11.5H5zM12 2.5V6h3.5M7.5 10h5M7.5 13h5" />,
  plus: <path d="M10 4v12M4 10h12" />,
  menu: <path d="M3 5.5h14M3 10h14M3 14.5h14" />,
  close: <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />,
  user: <><circle cx="10" cy="7" r="3.2" /><path d="M3.5 17c.8-3.2 3.2-4.8 6.5-4.8s5.7 1.6 6.5 4.8" /></>,
  gear: <><circle cx="10" cy="10" r="5.2" /><circle cx="10" cy="10" r="2.2" /><path d="M10 2.2v2.6M10 15.200v2.600M2.200 10h2.600M15.200 10h2.600M4.500 4.500l1.800 1.800M13.700 13.700l1.800 1.800M4.500 15.500l1.800-1.800M13.700 6.300l1.800-1.800" /></>,
}

function Icon({ name, size = 20, width = 1.7 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none"
      stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  )
}

function Sidebar({ open, onClose, page, notices }) {
  const { profile, signOut } = useAuth()
  const { openModal } = useData()
  const [gearOpen, setGearOpen] = useState(false)
  useEffect(() => {
    if (!gearOpen) return
    const close = (e) => { if (!e.target.closest('.profile')) setGearOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [gearOpen])
  return (
    <nav className={`sidebar${open ? ' is-open' : ''}`} aria-label="주 메뉴">
      <div className="sidebar-top">
        <img className="logo" src={logoWhite} alt="대림교회 로고" />
        <button type="button" className="icon-btn only-mobile" aria-label="메뉴 닫기" onClick={onClose}>
          <Icon name="close" width={2.2} />
        </button>
      </div>

      <div className="profile">
        <span className="avatar"><Icon name="user" /></span>
        <div className="profile-text">
          <strong>{profile.name} {profile.title}님</strong>
          <span>{profile.dept || '소속 없음'}{profile.role === 'admin' ? ' · 관리자' : ''}</span>
        </div>
        <button type="button" className="icon-btn" aria-label="설정" aria-expanded={gearOpen} onClick={() => setGearOpen(!gearOpen)}>
          <Icon name="gear" size={22} />
        </button>
        {gearOpen && (
          <div className="gear-menu">
            {profile.role === 'admin' && <a href="#admin" onClick={() => { setGearOpen(false); onClose() }}>회원 관리</a>}
            <button type="button" onClick={() => { setGearOpen(false); onClose(); openModal({ render: (close) => <ChangePasswordModal onClose={close} /> }) }}>비밀번호 변경</button>
            <button type="button" onClick={signOut}>로그아웃</button>
          </div>
        )}
      </div>

      <div className="nav">
        <a href="#home" onClick={onClose} className={`nav-item${page === 'home' ? ' is-current' : ''}`} aria-current={page === 'home' ? 'page' : undefined}>홈</a>
        <button type="button" className="nav-item is-action" onClick={() => { onClose(); openModal({ type: 'event' }) }}><Icon name="plus" size={18} width={2.2} />일정 등록</button>
        <button type="button" className="nav-item is-action" onClick={() => { onClose(); openModal({ type: 'car' }) }}><Icon name="plus" size={18} width={2.2} />차량 신청</button>
        <a href="#cars" onClick={onClose} className={`nav-item${page === 'cars' ? ' is-current' : ''}`} aria-current={page === 'cars' ? 'page' : undefined}>차량 현황</a>
        <a href="#" className="nav-item">교회 캘린더</a>
        <a href="#sermons" onClick={onClose} className={`nav-item${page === 'sermons' ? ' is-current' : ''}`} aria-current={page === 'sermons' ? 'page' : undefined}>예배 설교표</a>
        <a href="#" className="nav-item">부서 방</a>
        <a href="#" className="nav-item">내 책상</a>
      </div>

      <SideNotices notices={notices} onNavigate={onClose} />

      <section aria-labelledby="links-h">
        <h2 id="links-h" className="side-label pad">바로가기</h2>
        {links.map((l) => (
          <a key={l.name} href={l.href} className="side-link" target={l.href === '#' ? undefined : '_blank'} rel="noreferrer">
            <Icon name={l.icon} />{l.name}
          </a>
        ))}
      </section>
    </nav>
  )
}

const todayLabel = () => { const d = new Date(); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW_KO[d.getDay()]}요일` }

function usePage() {
  const read = () => ({ '#cars': 'cars', '#admin': 'admin', '#notices': 'notices', '#sermons': 'sermons', '#calendar': 'calendar' }[location.hash] ?? 'home')
  const [page, setPage] = useState(read)
  useEffect(() => {
    const on = () => { setPage(read()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return page
}

function Desk() {
  const page = usePage()
  const notices = useNotices()
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="app">
      <Sidebar open={menuOpen} page={page} notices={notices} onClose={() => setMenuOpen(false)} />
      {menuOpen && <div className="scrim only-mobile" onClick={() => setMenuOpen(false)} />}

      <main className="main">
        <div className="mobile-bar only-mobile">
          <button type="button" className="icon-btn" aria-label="메뉴 열기" onClick={() => setMenuOpen(true)}>
            <Icon name="menu" size={22} width={2.2} />
          </button>
          <span className="display">MINISTRY DESK</span>
        </div>

        <div className="ticker" aria-hidden="true">
          {'DAERIM CHURCH · MINISTRY DESK · 복음의 커다란 숲 · '.repeat(6)}
        </div>

        {page === 'admin' ? <AdminPage /> : page === 'notices' ? <NoticesPage notices={notices} /> : page === 'sermons' ? <SermonsMonth /> : page === 'cars' ? <CarsMonth /> : (
          <>
        <header className="title">
          <h1 className="display"><span className="cross" aria-hidden="true" />MINISTRY DESK</h1>
          <span className="muted">대림교회 / 사역 대시보드 / {todayLabel()}</span>
        </header>

        <NoticeStrip notices={notices} />
        <Folders />
        <div className="grid-2 top">
          <MySermons />
          <Todos />
        </div>
        <WeekCalendar />
        <SermonTable />
        <CarsWeek />
          </>
        )}
      </main>
    </div>
  )
}

export default function App() {
  const { session, profile, loading } = useAuth()
  if (session === undefined || loading) return <div className="splash">불러오는 중…</div>
  if (!session) return <LoginPage />
  if (!profile) return <div className="splash">계정 정보를 찾을 수 없습니다. 관리자에게 문의해 주세요.</div>
  if (profile.status !== 'approved') return <WaitingPage />
  return <DataProvider><Desk /></DataProvider>
}
