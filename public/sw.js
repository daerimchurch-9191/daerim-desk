// 대림교회 사역 데스크 서비스 워커: 홈 화면 앱 설치와 알림 받기만 맡는다 (화면 저장은 하지 않음).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
// 페이지(index.html)는 항상 서버에서 새로 받는다. 예전 화면이 남아 사라진 파일을 찾다 하얀 화면이 되는 것을 막는다.
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return
  e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => fetch(e.request)))
})

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data && e.data.text() } }
  e.waitUntil(self.registration.showNotification(d.title || '대림교회 사역 데스크', {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag,
    data: { url: new URL(d.url || './', self.registration.scope).href },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = e.notification.data && e.notification.data.url || self.registration.scope
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); return c.navigate(url) }
    }
    return self.clients.openWindow(url)
  })())
})
