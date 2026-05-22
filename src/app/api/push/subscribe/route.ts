import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const subscription = await req.json()
    const supabase = await createClient()

    // Count existing subscriptions
    const { count } = await supabase
      .from('push_subscriptions')
      .select('*', { count: 'exact', head: true })

    // If more than 5 accumulated (e.g. from testing in multiple incognito tabs),
    // purge all except the current one to prevent notification spam
    if ((count ?? 0) > 5) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .neq('endpoint', subscription.endpoint)
    }

    await supabase.from('push_subscriptions').upsert(
      {
        endpoint: subscription.endpoint,
        p256dh:   subscription.keys.p256dh,
        auth:     subscription.keys.auth,
      },
      { onConflict: 'endpoint' },
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Push subscribe error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
