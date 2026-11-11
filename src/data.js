// 화면 뼈대용 예시 데이터. 나중에 Supabase에서 읽어오는 코드로 바뀐다.

export const me = { name: '[이름]', title: '전도사', dept: '[소속 부서]' }

export const todayLabel = '2026년 11월 11일 수요일'
export const weekLabel = '2026년 11월 8일 – 11월 14일'

// 일정 구분: 색은 styles.css 의 .tag-* 와 짝을 이룬다
export const groups = [
  { id: 'all', name: '교회 전체' },
  { id: 'child', name: '유년부' },
  { id: 'youth', name: '청년부' },
  { id: 'parish', name: '교구' },
]

export const week = [
  { day: 'Sun', date: 8, events: [
    { time: '11:00', title: '주일예배', group: 'all' },
    { time: '09:30', title: '유년부 예배', group: 'child' },
    { time: '14:00', title: '청년부 예배', group: 'youth' },
  ] },
  { day: 'Mon', date: 9, events: [] },
  { day: 'Tue', date: 10, events: [
    { time: '10:00', title: '교역자 회의', group: 'all' },
    { time: '14:00', title: '교구 심방', group: 'parish' },
  ] },
  { day: 'Wed', date: 11, today: true, events: [
    { time: '19:30', title: '수요예배', group: 'all' },
    { time: '16:00', title: '유년부 교사 모임', group: 'child' },
  ] },
  { day: 'Thu', date: 12, events: [{ time: '10:30', title: '구역장 모임', group: 'parish' }] },
  { day: 'Fri', date: 13, events: [
    { time: '20:30', title: '금요기도회', group: 'all' },
    { time: '19:00', title: '청년부 리더 모임', group: 'youth' },
  ] },
  { day: 'Sat', date: 14, events: [
    { time: '10:00', title: '유년부 야외활동', group: 'child' },
    { time: '09:00', title: '청년부 봉사', group: 'youth' },
  ] },
]

export const mySermons = [
  { date: '11/13', dow: '금요일', time: '05:30', dday: 'D-2', title: '새벽기도회', passage: '[본문]' },
  { date: '11/15', dow: '주일', time: '09:30', dday: 'D-4', title: '유년부 예배', passage: '[본문]' },
  { date: '11/9', dow: '월요일', time: '05:30', done: true, title: '새벽기도회', passage: '[본문]' },
]

export const initialTodos = [
  { id: 1, text: '주일 설교 원고 초안', today: true, done: false },
  { id: 2, text: '야외활동 준비물 확인', today: true, done: false },
  { id: 3, text: '교역자 회의 자료 준비', repeat: '화', done: true },
  { id: 4, text: '교사 쪽지 발송', repeat: '목', done: false },
  { id: 5, text: '주일 설교 원고 마감', repeat: '금', done: false },
  { id: 6, text: '예배 위원 확인', repeat: '토', done: false },
]

// 새벽기도회는 주일 포함 매일
export const dawn = [
  { day: '일 8', preacher: '[설교자]' },
  { day: '월 9', preacher: '[내 이름]', mine: true },
  { day: '화 10', preacher: '[설교자]' },
  { day: '수 11', preacher: '[설교자]', today: true },
  { day: '목 12', preacher: '[설교자]' },
  { day: '금 13', preacher: '[내 이름]', mine: true },
  { day: '토 14', preacher: null },
]

export const services = [
  { name: '수요예배', when: '수 11일 19:30' },
  { name: '금요기도회', when: '금 13일 20:30' },
  { name: '특별 · 연합속회', when: '[날짜와 시간]', special: true },
]

// date 는 week 의 date 와 맞춘다. group 은 일정 구분 색과 같다
export const cars = [
  { name: '[차량 1 이름]', bookings: [
    { date: 10, time: '13:30 – 17:00', who: '교구', group: 'parish' },
    { date: 14, time: '09:00 – 15:00', who: '유년부', group: 'child' },
  ] },
  { name: '[차량 2 이름]', bookings: [{ date: 14, time: '08:30 – 13:00', who: '청년부', group: 'youth' }] },
  { name: '[차량 3 이름]', bookings: [] },
]

export const notices = [
  { title: '[공지 제목]', meta: '전체 · 11월 10일' },
  { title: '[공지 제목]', meta: '교육부 · 11월 9일' },
]

// 주소는 정해지면 채운다. '#' 은 아직 주소가 없다는 뜻
export const links = [
  { icon: 'globe', name: '교회 홈페이지', href: '#' },
  { icon: 'video', name: '교회 유튜브', href: '#' },
  { icon: 'camera', name: '교회 인스타그램', href: '#' },
  { icon: 'people', name: '디모데 교적 관리', href: 'https://w.dimode.co.kr/daerimchurch' },
  { icon: 'server', name: '나스', href: 'https://192-168-1-2.daerimnew.direct.quickconnect.to:5001/#/signin' },
  { icon: 'doc', name: '노션', href: '#' },
]

export const folderColors = [
  { id: 'green', name: '초록', dark: '#0F6B54', light: '#3E9C78' },
  { id: 'blue', name: '파랑', dark: '#2F5FA8', light: '#5C8AD0' },
  { id: 'amber', name: '노랑', dark: '#B5741A', light: '#E0A54A' },
  { id: 'purple', name: '보라', dark: '#6B479E', light: '#9778C4' },
  { id: 'gray', name: '회색', dark: '#4A524E', light: '#7E8883' },
]

export const initialFolders = [
  { id: 1, name: '설교 원고', color: 'green', href: '#' },
  { id: 2, name: '주간 업무', color: 'blue', href: '#' },
]

// 차량 월별 보기용 예시 (2026년 11월). day 는 날짜, car 는 cars 의 순서(0부터)
export const monthLabel = '2026년 11월'
export const monthStartDow = 0 // 11월 1일이 일요일
export const monthDays = 30
export const todayDate = 11
export const monthBookings = [
  { day: 3, car: 0, time: '10:00 – 12:00', who: '교구', group: 'parish' },
  { day: 7, car: 1, time: '09:00 – 17:00', who: '청년부', group: 'youth' },
  { day: 10, car: 0, time: '13:30 – 17:00', who: '교구', group: 'parish' },
  { day: 14, car: 0, time: '09:00 – 15:00', who: '유년부', group: 'child' },
  { day: 14, car: 1, time: '08:30 – 13:00', who: '청년부', group: 'youth' },
  { day: 18, car: 2, time: '14:00 – 16:00', who: '교회 전체', group: 'all' },
  { day: 21, car: 0, time: '10:00 – 18:00', who: '유년부', group: 'child' },
  { day: 26, car: 1, time: '13:00 – 15:00', who: '교구', group: 'parish' },
]
