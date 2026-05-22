import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

webpush.setVapidDetails(
  'mailto:info@jaegerstieg.de',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

// Simple in-process rate limiter: same room can only trigger once per 30s.
// Prevents duplicate notifications if a guest double-taps submit.
const lastSent = new Map<string, number>()
const RATE_LIMIT_MS = 30_000

export async function POST(req: NextRequest) {
  try {
    const { roomNumber, title, body, url } = await req.json()

    // Rate limit per room
    const now = Date.now()
    const key = `${roomNumber}:${title ?? 'order'}`
    if (now - (lastSent.get(key) ?? 0) < RATE_LIMIT_MS) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'rate_limited' })
    }
    lastSent.set(key, now)

    const supabase = await createClient()
    const { data: subs } = await supabase.from('push_subscriptions').select('*')
    if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    const payload = JSON.stringify({
      title: title ?? '🔔 Neue Bestellung!',
      body:  body  ?? `Zimmer ${roomNumber} hat bestellt`,
      url:   url   ?? '/service-orders',
    })

    const results = await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          )
        } catch (err: any) {
          // 410 Gone = subscription expired, remove it
          if (err?.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        }
      }),
    )

    return NextResponse.json({ ok: true, sent: results.length })
  } catch (err) {
    console.error('Push send error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
