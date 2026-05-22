'use client'

import { useEffect } from 'react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

export default function PushSubscriber() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    async function setup() {
      try {
        // Register service worker
        const reg = await navigator.serviceWorker.register('/sw.js')

        // Don't ask again if already granted or denied
        if (Notification.permission === 'denied') return
        if (Notification.permission === 'default') {
          const result = await Notification.requestPermission()
          if (result !== 'granted') return
        }

        // Check if already subscribed
        const existing = await reg.pushManager.getSubscription()
        if (existing) {
          // Re-register to keep subscription fresh
          await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(existing),
          })
          return
        }

        // Subscribe to push
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription),
        })
      } catch (err) {
        // Silently fail — push is a nice-to-have
        console.warn('Push setup failed:', err)
      }
    }

    setup()
  }, [])

  return null
}
