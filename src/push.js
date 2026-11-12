// 홈 화면 앱(서비스 워커) 등록과 휴대폰 알림 켜기/끄기
import { supabase } from './auth.jsx'

export const VAPID_PUBLIC = 'BMJrL3BqJ7IZ4GttnwRxyGH_gCaVrPMMt1qoZXs5wE3IgayiKZtGwY5kVFKw1Icr5A3yC8_S73U7JwPydfs1ihk'

export function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  }
}

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function keyBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

// 'unsupported' | 'need-install'(아이폰에서 홈 화면 앱이 아님) | 'denied' | 'off' | 'on'
export async function pushState() {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'need-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration('./')
  const sub = reg && await reg.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

export async function enablePush() {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'denied' : '알림 허용을 누르지 않았습니다.')
  const reg = await navigator.serviceWorker.register('./sw.js')
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) })
  const { error } = await supabase.functions.invoke('notify-notice', { body: { subscribe: sub.toJSON() } })
  if (error) throw error
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration('./')
  const sub = reg && await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function sendTestPush() {
  const { data, error } = await supabase.functions.invoke('notify-notice', { body: { test: true } })
  if (error) throw error
  return data
}

export async function sendNoticePush(noticeId) {
  const { data, error } = await supabase.functions.invoke('notify-notice', { body: { notice_id: noticeId } })
  if (error) throw error
  return data
}

// 안드로이드·PC 크롬: "앱 설치" 버튼용 이벤트를 잡아 둔다
let installEvent = null
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e })
export const canInstall = () => Boolean(installEvent)
export async function promptInstall() {
  if (!installEvent) return false
  installEvent.prompt()
  const { outcome } = await installEvent.userChoice
  installEvent = null
  return outcome === 'accepted'
}
