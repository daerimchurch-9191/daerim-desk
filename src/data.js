// 바로가기 목록과 폴더 색


export const links = [
  { icon: 'globe', name: '교회 홈페이지', href: 'https://www.drmch.kr' },
  { icon: 'video', name: '교회 유튜브', href: 'https://www.youtube.com/@daerimchurch9191' },
  { icon: 'camera', name: '교회 인스타그램', href: 'https://www.instagram.com/daerimchurch' },
  { icon: 'people', name: '디모데 교적 관리', href: 'https://w.dimode.co.kr/daerimchurch' },
  { icon: 'server', name: '나스', href: 'https://192-168-1-2.daerimnew.direct.quickconnect.to:5001/#/signin' },
]

// 폴더 색: 앞면(light)만 정하면 탭(dark)은 같은 색조로 일정 비율만큼 진하게 계산된다.
const TAB_L = 0.756407717813173, TAB_S = 0.6987476865846771 // 탭 밝기·채도 비율 (처음 다섯 색의 평균)
function hexToHsl(h) {
  const r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, b = parseInt(h.slice(5, 7), 16) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  let H = 0, S = 0
  if (mx !== mn) {
    const d = mx - mn
    S = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    H = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    H /= 6
  }
  return [H, S, l]
}
function hslToHex(H, S, L) {
  const f = (n) => {
    const k = (n + H * 12) % 12, a = S * Math.min(L, 1 - L)
    return Math.round((L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0')
  }
  return ('#' + f(0) + f(8) + f(4)).toUpperCase()
}
export function tabColor(front) {
  const [h, s, l] = hexToHsl(front)
  return hslToHex(h, Math.min(1, s * TAB_S), l * TAB_L)
}
const fronts = [
  ['green', '초록', '#92DDA5'],
  ['blue', '파랑', '#AED2F4'],
  ['amber', '노랑', '#F4EC95'],
  ['purple', '보라', '#CBBCE2'],
  ['gray', '회색', '#BEC4C1'],
]
export const folderColors = fronts.map(([id, name, light]) => ({ id, name, light, dark: tabColor(light) }))

