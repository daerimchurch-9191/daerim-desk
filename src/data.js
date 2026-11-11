// 아직 실제 데이터로 연결하지 않은 부분의 예시 데이터 (할 일, 공지, 폴더)와 바로가기 목록.

export const initialTodos = [
  { id: 1, text: '주일 설교 원고 초안', today: true, done: false },
  { id: 2, text: '야외활동 준비물 확인', today: true, done: false },
  { id: 3, text: '교역자 회의 자료 준비', repeat: '화', done: true },
  { id: 4, text: '교사 쪽지 발송', repeat: '목', done: false },
  { id: 5, text: '주일 설교 원고 마감', repeat: '금', done: false },
  { id: 6, text: '예배 위원 확인', repeat: '토', done: false },
]

export const notices = [
  { title: '[공지 제목]', meta: '전체 · 11월 10일' },
  { title: '[공지 제목]', meta: '교육부 · 11월 9일' },
]

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
