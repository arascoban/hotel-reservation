// Service Worker for Jägerstieg Hotel push notifications

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || '🔔 Neue Bestellung!'
  const options = {
    body:      data.body  || 'Eine neue Zimmerbestellung ist eingegangen.',
    icon:      '/logo.png',
    badge:     '/logo.png',
    tag:       'new-order',
    renotify:  true,
    vibrate:   [200, 100, 200, 100, 200],
    data:      { url: data.url || '/service-orders' },
    actions: [
      { action: 'open', title: '📋 Bestellungen öffnen' },
      { action: 'close', title: 'Schließen' },
    ],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'close') return
  const url = event.notification.data?.url || '/service-orders'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      // Otherwise open new window
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
