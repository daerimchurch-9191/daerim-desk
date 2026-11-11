import { useEffect, useState } from 'react'
import { useAuth } from './auth.jsx'
import { LoginPage, WaitingPage } from './LoginPage.jsx'
import { AdminPage } from './AdminPage.jsx'
import { DataProvider, useData, WeekCalendar, CarsWeek, CarsMonth } from './live.jsx'
import {
  todayLabel, mySermons, initialTodos, dawn, services, notices, links, folderColors, initialFolders,
} from './data.js'

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

function FolderIcon({ color }) {
  const c = folderColors.find((f) => f.id === color) ?? folderColors[0]
  return (
    <svg aria-hidden="true" width="72" height="56" viewBox="0 0 76 60">
      <path d="M4 12a6 6 0 0 1 6-6h18l7 8h31a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill={c.dark} />
      <path d="M4 22h68v28a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill={c.light} />
    </svg>
  )
}

function Sidebar({ open, onClose, page }) {
  const { profile, signOut } = useAuth()
  const { openModal } = useData()
  const [gearOpen, setGearOpen] = useState(false)
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
        <a href="#" className="nav-item">예배 설교표</a>
        <a href="#" className="nav-item">부서 방</a>
        <a href="#" className="nav-item">내 책상</a>
      </div>

      <section className="side-notice" aria-labelledby="notice-h">
        <div className="side-notice-head">
          <h2 id="notice-h" className="side-label">공지</h2>
          <span className="badge-new">새 글 {notices.length}</span>
        </div>
        {notices.map((n, i) => (
          <a href="#" key={i} className="side-notice-item">
            <strong>{n.title}</strong>
            <span>{n.meta}</span>
          </a>
        ))}
        <a href="#" className="side-more">공지 전체 보기</a>
      </section>

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

function Folders() {
  const [folders, setFolders] = useState(initialFolders)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [href, setHref] = useState('')
  const [color, setColor] = useState('green')

  function add(e) {
    e.preventDefault()
    if (!name.trim()) return
    setFolders([...folders, { id: Date.now(), name: name.trim(), color, href: href.trim() || '#' }])
    setName(''); setHref(''); setColor('green'); setAdding(false)
  }

  return (
    <section className="folders" aria-label="내 폴더">
      {folders.map((f) => (
        <a key={f.id} href={f.href} className="folder"><FolderIcon color={f.color} />{f.name}</a>
      ))}
      <button type="button" className="folder folder-add" onClick={() => setAdding(true)}>
        <span className="folder-add-box"><Icon name="plus" size={22} width={2.2} /></span>폴더 추가
      </button>

      {adding && (
        <div className="overlay" onClick={() => setAdding(false)}>
          <form className="dialog" onSubmit={add} onClick={(e) => e.stopPropagation()} aria-labelledby="folder-h">
            <h2 id="folder-h" className="pill">폴더 추가</h2>
            <div className="dialog-preview"><FolderIcon color={color} /><span>고른 색으로 홈 화면 폴더 줄에 나타납니다.</span></div>
            <label className="field">폴더 이름
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 예배 자료" autoFocus />
            </label>
            <label className="field">연결할 위치
              <input value={href} onChange={(e) => setHref(e.target.value)} placeholder="나스 폴더 경로 또는 링크 주소" />
            </label>
            <fieldset className="swatches">
              <legend>폴더 색</legend>
              {folderColors.map((c) => (
                <label key={c.id} className="swatch">
                  <input type="radio" name="color" checked={color === c.id} onChange={() => setColor(c.id)} />
                  <span className="swatch-dot" style={{ background: c.dark }} />{c.name}
                </label>
              ))}
            </fieldset>
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setAdding(false)}>취소</button>
              <button type="submit" className="btn btn-primary">추가하기</button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}

function MySermons() {
  return (
    <section className="block" aria-labelledby="sermon-h">
      <h2 id="sermon-h" className="pill">내 설교</h2>
      <div className="card">
        <div className="card-head">
          <span className="muted">이번 주 설교</span>
          <span className="count">{mySermons.length} <small>편</small></span>
        </div>
        {mySermons.map((s, i) => (
          <div key={i} className="sermon-row">
            <span className={`date-badge${s.done ? ' is-done' : ''}`}><b>{s.date}</b><span>{s.dow}</span></span>
            <div className="grow">
              <span className="muted small">{s.time} {s.done ? '· 완료' : <span className="chip">{s.dday}</span>}</span>
              <span className={s.done ? 'muted' : ''}>{s.title} · {s.passage}</span>
            </div>
            <button type="button" className="link-btn">수정</button>
          </div>
        ))}
        <button type="button" className="btn btn-dashed">+ 설교 추가</button>
        <p className="note push">예배 설교표와 연동됩니다. 본문은 어느 쪽에서 고쳐도 같이 바뀝니다.</p>
      </div>
    </section>
  )
}

function Todos() {
  const [todos, setTodos] = useState(initialTodos)
  const [filter, setFilter] = useState('week')
  const filters = [
    { id: 'week', name: '이번 주', test: () => true },
    { id: 'today', name: '오늘', test: (t) => t.today },
    { id: 'repeat', name: '매주 반복', test: (t) => t.repeat },
  ]
  const shown = todos.filter(filters.find((f) => f.id === filter).test)
  const toggle = (id) => setTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))

  return (
    <section className="block" aria-labelledby="todo-h">
      <h2 id="todo-h" className="pill">Todolist</h2>
      <div className="card">
        <div className="tabs">
          {filters.map((f) => (
            <button key={f.id} type="button" className={`tab${filter === f.id ? ' is-on' : ''}`}
              aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.name} {todos.filter(f.test).length}
            </button>
          ))}
          <button type="button" className="btn btn-primary tabs-end">+ 할 일 추가</button>
        </div>
        {shown.map((t) => (
          <div key={t.id} className="todo-row">
            <input id={`todo-${t.id}`} type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />
            <label htmlFor={`todo-${t.id}`} className={`grow${t.done ? ' is-done' : ''}`}>{t.text}</label>
            {t.repeat ? <span className="chip">매주 {t.repeat}</span> : <span className="chip chip-plain">오늘</span>}
            <button type="button" className="link-btn">수정</button>
          </div>
        ))}
      </div>
    </section>
  )
}

function SermonTable() {
  return (
    <section className="block" aria-labelledby="table-h">
      <div className="block-head">
        <h2 id="table-h" className="pill">예배 설교표</h2>
        <strong>이번 주 · 모두 함께 보고 씁니다</strong>
      </div>
      <div className="card">
        <div className="grid-2">
          <div className="box">
            <h3>새벽기도회 <small>매일 05:30 · 주일 포함</small></h3>
            {dawn.map((d) => (
              <div key={d.day} className="table-row">
                <b className={d.today ? 'accent' : ''}>{d.day}</b>
                {d.preacher
                  ? <span className="grow">{d.preacher} · [본문] {d.mine && <span className="chip">내 설교</span>}</span>
                  : <span className="grow muted">아직 비어 있음</span>}
                <button type="button" className="link-btn">{d.preacher ? '수정' : '입력'}</button>
              </div>
            ))}
          </div>
          <div className="stack">
            {services.map((s) => (
              <div key={s.name} className="box">
                <div className="table-row no-line">
                  <div className="grow">
                    <h3>{s.name} <small>{s.when}</small></h3>
                    <span>[설교자] · [본문]</span>
                  </div>
                  <button type="button" className="link-btn">수정</button>
                </div>
                {s.special && <button type="button" className="btn btn-dashed">+ 특별 예배 추가</button>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function usePage() {
  const read = () => ({ '#cars': 'cars', '#admin': 'admin' }[location.hash] ?? 'home')
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
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="app">
      <Sidebar open={menuOpen} page={page} onClose={() => setMenuOpen(false)} />
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

        {page === 'admin' ? <AdminPage /> : page === 'cars' ? <CarsMonth /> : (
          <>
        <header className="title">
          <h1 className="display"><span className="cross" aria-hidden="true" />MINISTRY DESK</h1>
          <span className="muted">대림교회 / 사역 대시보드 / {todayLabel}</span>
        </header>

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
