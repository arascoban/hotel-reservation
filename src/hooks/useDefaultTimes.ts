'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_CHECKIN_HOUR, DEFAULT_CHECKOUT_HOUR } from '@/lib/reservations'

const FALLBACK_IN  = `${String(DEFAULT_CHECKIN_HOUR).padStart(2, '0')}:00`
const FALLBACK_OUT = `${String(DEFAULT_CHECKOUT_HOUR).padStart(2, '0')}:00`

/**
 * The hotel's default arrival / departure times, set under Einstellungen.
 *
 * `ready` tells a form whether the values are the stored ones yet, so it can
 * pre-fill its inputs once without overwriting a time the user just picked.
 */
export function useDefaultTimes() {
  const [checkinTime,  setCheckinTime]  = useState(FALLBACK_IN)
  const [checkoutTime, setCheckoutTime] = useState(FALLBACK_OUT)
  const [ready,        setReady]        = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase
        .from('invoice_settings')
        .select('default_checkin_time, default_checkout_time')
        .eq('id', 1).maybeSingle()
      if (cancelled) return
      const s = data as { default_checkin_time?: string | null; default_checkout_time?: string | null } | null
      if (s?.default_checkin_time)  setCheckinTime(s.default_checkin_time.slice(0, 5))
      if (s?.default_checkout_time) setCheckoutTime(s.default_checkout_time.slice(0, 5))
      setReady(true)
    })()
    return () => { cancelled = true }
  }, [])

  return { checkinTime, checkoutTime, ready }
}
