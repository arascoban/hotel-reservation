import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

webpush.setVapidDetails(
  'mailto:info@jaegerstieg.de',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const { roomNumber } = await req.json()
    const supabase = await createClient()

    const { data: subs } = await supabase.from('push_subscriptions').select('*')
    if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    const payload = JSON.stringify({
      title: '🔔 Neue Bestellung!',
      body:  `Zimmer ${roomNumber} hat bestellt`,
      url:   '/service-orders',
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
