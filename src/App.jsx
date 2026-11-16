import { useEffect, useRef, useState } from 'react'
import { useAuth, visitRooms } from './auth.jsx'
import { LoginPage, WaitingPage } from './LoginPage.jsx'
import { ChangePasswordModal } from './AdminPage.jsx'
import { PushSettingsModal } from './PushSettings.jsx'
import { VisitsPage } from './visits.jsx'
import { AdminHub } from './adminhub.jsx'
import { AdsPage } from './ads.jsx'
import { LeavePage } from './leave.jsx'
import { DataProvider, useData, deptNames, WeekCalendar, CarsWeek, CarsMonth, CalendarMonth, DOW_KO, useIsPhone, TodayCard } from './live.jsx'
import { MySermons, SermonTable, SermonsMonth } from './sermons.jsx'
import { Todos } from './personal.jsx'
import { links } from './data.js'
import { HomeTools, PhoneTools } from './home.jsx'
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
  const { openModal, departments } = useData()
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
        <a href="#home" className="logo-link" onClick={() => { onClose(); window.scrollTo(0, 0) }} aria-label="홈으로">
          <img className="logo" src={logoWhite} alt="대림교회 로고" />
        </a>
        <button type="button" className="icon-btn only-mobile" aria-label="메뉴 닫기" onClick={onClose}>
          <Icon name="close" width={2.2} />
        </button>
      </div>

      <div className="profile">
        <span className="avatar"><Icon name="user" /></span>
        <div className="profile-text">
          <strong>{profile.name} {profile.title}님</strong>
          <span>{deptNames(profile.dept_ids, departments) || '소속 없음'}{profile.role === 'admin' ? ' · 관리자' : ''}</span>
        </div>
        <button type="button" className="icon-btn" aria-label="설정" aria-expanded={gearOpen} onClick={() => setGearOpen(!gearOpen)}>
          <Icon name="gear" size={22} />
        </button>
        {gearOpen && (
          <div className="gear-menu">
            {profile.role === 'admin' && <a href="#admin" className="gear-admin" onClick={() => { setGearOpen(false); onClose() }}>관리자 메뉴</a>}
            <button type="button" onClick={() => { setGearOpen(false); onClose(); openModal({ render: (close) => <PushSettingsModal onClose={close} /> }) }}>앱·알림 설정</button>
            <button type="button" onClick={() => { setGearOpen(false); onClose(); openModal({ render: (close) => <ChangePasswordModal onClose={close} /> }) }}>비밀번호 변경</button>
            <button type="button" onClick={signOut}>로그아웃</button>
          </div>
        )}
      </div>

      <div className="nav">
        <div className="quick-actions">
          <button type="button" className="nav-item is-action" onClick={() => { onClose(); openModal({ type: 'event' }) }}><Icon name="plus" size={16} width={2.2} />일정</button>
          <button type="button" className="nav-item is-action" onClick={() => { onClose(); openModal({ type: 'car' }) }}><Icon name="plus" size={16} width={2.2} />차량</button>
        </div>
        <a href="#home" onClick={onClose} className={`nav-item${page === 'home' ? ' is-current' : ''}`} aria-current={page === 'home' ? 'page' : undefined}>홈</a>
        <a href="#cars" onClick={onClose} className={`nav-item${page === 'cars' ? ' is-current' : ''}`} aria-current={page === 'cars' ? 'page' : undefined}>차량 현황</a>
        <a href="#calendar" onClick={onClose} className={`nav-item${page === 'calendar' ? ' is-current' : ''}`} aria-current={page === 'calendar' ? 'page' : undefined}>교회 캘린더</a>
        <a href="#sermons" onClick={onClose} className={`nav-item${page === 'sermons' ? ' is-current' : ''}`} aria-current={page === 'sermons' ? 'page' : undefined}>예배 설교표</a>
        <a href="#leave" onClick={onClose} className={`nav-item${page === 'leave' ? ' is-current' : ''}`} aria-current={page === 'leave' ? 'page' : undefined}>연차</a>
        <a href="#ads" onClick={onClose} className={`nav-item${page === 'ads' ? ' is-current' : ''}`} aria-current={page === 'ads' ? 'page' : undefined}>주보 광고</a>
        {visitRooms(profile, departments).length > 0 && <a href="#visits" onClick={onClose} className={`nav-item${page === 'visits' ? ' is-current' : ''}`} aria-current={page === 'visits' ? 'page' : undefined}>심방보고</a>}
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
  const read = () => location.hash.startsWith('#admin') || location.hash === '#perms' ? 'admin' : location.hash.startsWith('#leave') ? 'leave' : ({ '#cars': 'cars', '#notices': 'notices', '#sermons': 'sermons', '#calendar': 'calendar', '#ads': 'ads', '#visits': 'visits', '#perms': 'perms' }[location.hash] ?? 'home')
  const [page, setPage] = useState(read)
  useEffect(() => {
    const on = () => { setPage(read()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return page
}

/* ---------- 휴대폰 ---------- */
// 사람마다 홈 순서: 직분 '목사' → 목사님, 교구 소속 → 교구(심방) 전도사님, 그 외 → 교육부
function roleOf(profile, departments) {
  if ((profile.title ?? '').includes('목사')) return 'pastor'
  const grps = (profile.dept_ids ?? []).map((id) => departments.find((d) => d.id === id)?.grp)
  return grps.includes('parish') ? 'parish' : 'edu'
}

function VisitRoomsCard() {
  const { profile } = useAuth()
  const { departments } = useData()
  const rooms = visitRooms(profile, departments)
  if (!rooms.length) return null
  return (
    <section className="hc" aria-labelledby="vr-h">
      <div className="hc-head"><h2 id="vr-h" className="hc-title"><a href="#visits">심방보고</a></h2><span className="hc-right"><a href="#visits" className="hc-more">심방보고 →</a></span></div>
      <div className="vr-grid">
        {rooms.map((r) => <a key={r.id} href="#visits" className="vr-room"><b>{r.name}</b><span>방 들어가기</span></a>)}
      </div>
    </section>
  )
}

function PhoneHome() {
  const { profile } = useAuth()
  const { departments } = useData()
  const role = roleOf(profile, departments)
  if (role === 'pastor') return <div className="home-v2"><MySermons /><Todos /><TodayCard /><VisitRoomsCard /></div>
  if (role === 'parish') return <div className="home-v2"><Todos /><TodayCard /><VisitRoomsCard /></div>
  return <div className="home-v2"><Todos /><TodayCard /><MySermons /></div>
}

const TAB_PAGES = ['home', 'calendar', 'cars', 'sermons']
const TAB_HASH = { home: '#home', calendar: '#calendar', cars: '#cars', sermons: '#sermons' }

function PlusSheet({ onClose }) {
  const { profile } = useAuth()
  const { openModal, departments } = useData()
  const canVisit = visitRooms(profile, departments).length > 0
  const pick = (fn) => () => { onClose(); fn() }
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label="추가하기" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grab" aria-hidden="true" />
        <h2 className="sheet-title">무엇을 추가할까요?</h2>
        <button type="button" className="sheet-opt" onClick={pick(() => openModal({ type: 'event' }))}><b>일정 등록</b><span>교회·부서·개인</span></button>
        <button type="button" className="sheet-opt" onClick={pick(() => openModal({ type: 'car' }))}><b>차량 신청</b><span>겹치면 신청할 수 없어요</span></button>
        {canVisit && <button type="button" className="sheet-opt" onClick={pick(() => { location.hash = '#visits' })}><b>심방보고 쓰기</b><span>교구 방으로 이동</span></button>}
      </div>
    </div>
  )
}

function PhoneTabs({ page }) {
  const [plus, setPlus] = useState(false)
  const tab = (id, name, icon) => (
    <a href={TAB_HASH[id]} className={`ptab${page === id ? ' is-on' : ''}`} aria-current={page === id ? 'page' : undefined}>
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      <span>{name}</span>
    </a>
  )
  return (
    <>
      <nav className="phone-tabs" aria-label="아래 메뉴">
        {tab('home', '홈', <path d="M3.5 9 10 3.5 16.5 9v7.5h-4.5v-5H8v5H3.5z" />)}
        {tab('calendar', '캘린더', <><rect x="3" y="4.5" width="14" height="12.5" rx="2" /><path d="M3 8.5h14M7 2.8v3.4M13 2.8v3.4" /></>)}
        <button type="button" className="ptab-plus" aria-label="추가하기" onClick={() => setPlus(true)}>
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M10 4v12M4 10h12" /></svg>
        </button>
        {tab('cars', '차량', <><path d="M3 12.5V9l1.8-4h10.4L17 9v3.5zM3 12.5V15h2.5v-2.5M14.5 12.5V15H17v-2.5M3 9h14" /><circle cx="6.3" cy="11" r=".6" /><circle cx="13.7" cy="11" r=".6" /></>)}
        {tab('sermons', '설교표', <path d="M4 3.5h9.5L16 6v10.5H4zM7 8h6M7 11h6M7 14h4" />)}
      </nav>
      {plus && <PlusSheet onClose={() => setPlus(false)} />}
    </>
  )
}

// 휴대폰: 화면 가운데를 옆으로 밀면 홈 → 캘린더 → 차량 → 설교표
// 손가락을 따라 화면이 움직이고, 놓으면 밀려 나간 뒤 다음 화면이 들어온다
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
function useSwipeTabs(ref, page, enabled) {
  // 들어오는 화면: 어느 쪽에서 들어올지 (탭을 눌러도 같은 움직임)
  const last = useRef(page)
  useEffect(() => {
    const el = ref.current, from = TAB_PAGES.indexOf(last.current), to = TAB_PAGES.indexOf(page)
    last.current = page
    if (!el || !enabled || from < 0 || to < 0 || from === to || reduceMotion()) { if (el) { el.style.transition = ''; el.style.transform = ''; el.style.opacity = '' } return }
    el.style.transition = 'none'
    el.style.transform = `translateX(${to > from ? 36 : -36}%)`
    el.style.opacity = '0.4'
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = 'transform .24s cubic-bezier(.2,.8,.2,1), opacity .24s'
      el.style.transform = ''
      el.style.opacity = ''
    }))
  }, [page])

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled || !TAB_PAGES.includes(page)) return
    const idx = TAB_PAGES.indexOf(page)
    let sx = 0, sy = 0, ok = false, mode = '' // '' 아직 모름 · 'x' 옆으로 · 'y' 위아래
    const W = () => window.innerWidth
    const start = (e) => {
      const t = e.touches[0]
      sx = t.clientX; sy = t.clientY; mode = ''
      // 화면 끝(아이폰 뒤로 가기)·옆으로 움직이는 부분·입력칸·창 안에서는 넘기지 않는다
      ok = sx > 28 && sx < W() - 28 && !e.target.closest('input, textarea, select, .no-swipe, .hc-seg, .tabs, .scroll-x, .month, .dialog, .overlay, .sheet-wrap, .phone-search, .hb-pop')
    }
    const move = (e) => {
      if (!ok) return
      const t = e.touches[0]
      const dx = t.clientX - sx, dy = t.clientY - sy
      if (!mode) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        mode = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y'
      }
      if (mode !== 'x') return
      e.preventDefault()
      // 맨 처음·맨 끝 화면에서는 고무줄처럼 덜 움직인다
      const edge = (dx > 0 && idx === 0) || (dx < 0 && idx === TAB_PAGES.length - 1)
      el.style.transition = 'none'
      el.style.transform = `translateX(${edge ? dx * 0.25 : dx}px)`
    }
    const end = (e) => {
      if (!ok || mode !== 'x') return
      const dx = e.changedTouches[0].clientX - sx
      const i = idx + (dx < 0 ? 1 : -1)
      if (Math.abs(dx) > 70 && i >= 0 && i < TAB_PAGES.length) {
        el.style.transition = 'transform .16s ease-in, opacity .16s'
        el.style.transform = `translateX(${dx < 0 ? -45 : 45}%)`
        el.style.opacity = '0.3'
        setTimeout(() => { location.hash = TAB_HASH[TAB_PAGES[i]] }, 150)
      } else {
        el.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)'
        el.style.transform = ''
      }
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end, { passive: true })
    el.addEventListener('touchcancel', end, { passive: true })
    return () => {
      el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end)
    }
  }, [page, enabled])
}

function Desk() {
  const page = usePage()
  const notices = useNotices()
  const [menuOpen, setMenuOpen] = useState(false)
  const phone = useIsPhone()
  const mainRef = useRef(null)
  useSwipeTabs(mainRef, page, phone && !menuOpen)
  return (
    <div className={`app${phone ? ' is-phone' : ''}`}>
      <Sidebar open={menuOpen} page={page} notices={notices} onClose={() => setMenuOpen(false)} />
      {menuOpen && <div className="scrim only-mobile" onClick={() => setMenuOpen(false)} />}

      <main className="main">
        <div className="mobile-bar only-mobile">
          <button type="button" className="icon-btn" aria-label="메뉴 열기" onClick={() => setMenuOpen(true)}>
            <Icon name="menu" size={22} width={2.2} />
          </button>
          <a href="#home" className="display mobile-home" onClick={() => window.scrollTo(0, 0)}>MINISTRY DESK</a>
          {phone && <span className="mobile-tools"><PhoneTools notices={notices} /></span>}
        </div>

        <div className="swipe-page" ref={mainRef}>
        <div className="ticker" aria-hidden="true">
          {'DAERIM CHURCH · MINISTRY DESK · 복음의 커다란 숲 · '.repeat(6)}
        </div>

        {page === 'admin' ? <AdminHub /> : page === 'leave' ? <LeavePage /> : page === 'ads' ? <AdsPage /> : page === 'visits' ? <VisitsPage /> : page === 'notices' ? <NoticesPage notices={notices} /> : page === 'sermons' ? <SermonsMonth /> : page === 'calendar' ? <CalendarMonth /> : page === 'cars' ? <CarsMonth /> : (
          phone ? <PhoneHome /> : <>
        <div className="home-top">
          <header className="title">
            <h1 className="display"><span className="cross" aria-hidden="true" />MINISTRY DESK</h1>
            <span className="muted">대림교회 / 사역 대시보드 / {todayLabel()}</span>
          </header>
          <HomeTools notices={notices} />
        </div>

        <NoticeStrip notices={notices} />
        <div className="home-v2">
          <div className="hc-pair">
            <MySermons />
            <Todos />
          </div>
          <WeekCalendar />
          <SermonTable />
          <CarsWeek />
        </div>
          </>
        )}
        </div>
      </main>
      {phone && <PhoneTabs page={page} />}
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
