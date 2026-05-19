/**
 * POST /api/ical/sync          — manual trigger (requires Supabase session)
 * GET  /api/ical/sync          — cron trigger  (requires Authorization: Bearer CRON_SECRET)
 *
 * Fetches external iCal feeds (Booking.com, Expedia, Airbnb) and imports
 * their events as reservations in the database.
 *
 * POST body (JSON, optional):
 *   { feedId?: string }   — sync one specific feed, or omit to sync all active feeds
 *
 * Rules:
 *   - If external_id already exists → update dates/summary if changed
 *   - If new event → insert as reservation (status=confirmed)
 *   - If event conflicts with a MANUAL reservation → skip, log warning
 *   - Cancelled/no-show reservations are never overwritten
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseIcal } from '@/lib/ical'
import type { ReservationSource } from '@/types/database'

// ─── GET handler — called by Vercel Cron or external cron services ────────────
// Authorization: Bearer <CRON_SECRET>

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth   = req.headers.get('authorization') ?? ''

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Reuse the same sync logic as POST (sync all feeds)
  return runSync(undefined)
}

// ─── POST handler — called manually from the UI ───────────────────────────────

const PLATFORM_SOURCE: Record<string, ReservationSource> = {
  booking_com: 'booking_com',
  expedia:     'expedia',
  airbnb:      'airbnb',
  other:       'other',
}

// Booking.com / Airbnb use summary text like "CLOSED" or "Not available"
// to indicate blocked dates rather than real guest names.
const BLOCKED_SUMMARIES = [
  'closed', 'not available', 'unavailable', 'blocked',
  'airbnb (not available)', 'booking.com (not available)',
]

function isBlockedEvent(summary: string): boolean {
  return BLOCKED_SUMMARIES.some(b => summary.toLowerCase().includes(b))
}

export async function POST(req: Request) {
  const supabase = await createClient()

  // Require Supabase session for manual triggers
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  return runSync(body.feedId)
}

// ─── Shared sync logic ────────────────────────────────────────────────────────

async function runSync(specificFeedId: string | undefined) {
  const supabase = await createClient()

  // Load feeds to sync
  let feedQuery = supabase
    .from('sync_feeds')
    .select('id, room_id, platform, url, rooms(name, room_number)')
    .eq('feed_type', 'import')
    .eq('is_active', true)
    .not('url', 'is', null)

  if (specificFeedId) {
    feedQuery = feedQuery.eq('id', specificFeedId)
  }

  const { data: feeds, error: feedErr } = await feedQuery

  if (feedErr || !feeds?.length) {
    return NextResponse.json({
      success: false,
      error: 'No active import feeds found.',
    }, { status: 404 })
  }

  const results = []

  for (const feed of feeds) {
    const logStart = Date.now()
    let eventsCreated  = 0
    let eventsUpdated  = 0
    let eventsSkipped  = 0
    let conflictsFound = 0
    let errorMessage: string | undefined

    try {
      // 1. Fetch the external iCal URL
      const response = await fetch(feed.url!, {
        headers: { 'User-Agent': 'HotelReceptionSystem/1.0' },
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const icalText = await response.text()
      const events   = parseIcal(icalText)

      const source: ReservationSource = PLATFORM_SOURCE[feed.platform] ?? 'other'

      // 2. Process each event
      for (const event of events) {
        const checkinAt  = event.dtstart
        const checkoutAt = event.dtend
        const guestName  = isBlockedEvent(event.summary) ? 'Blocked' : event.summary

        // Build timestamps using hotel default times (15:00 in, 11:00 out)
        // For date-only iCal events, we add the standard hotel times.
        const checkinTs  = buildTs(checkinAt,  15)
        const checkoutTs = buildTs(checkoutAt, 11)

        // 3. Check if this UID already exists
        const { data: existing } = await supabase
          .from('reservations')
          .select('id, checkin_at, checkout_at, source, status')
          .eq('external_id', event.uid)
          .eq('room_id', feed.room_id)
          .single()

        if (existing) {
          // Skip if it's a manual reservation (don't overwrite)
          if (existing.source !== source) {
            eventsSkipped++
            continue
          }

          // Skip cancelled/no-show
          if (['cancelled', 'no_show'].includes(existing.status)) {
            eventsSkipped++
            continue
          }

          // Update if dates changed
          const datesChanged =
            existing.checkin_at  !== checkinTs ||
            existing.checkout_at !== checkoutTs

          if (datesChanged) {
            const { error: updateErr } = await supabase
              .from('reservations')
              .update({
                checkin_at:  checkinTs,
                checkout_at: checkoutTs,
                guest_name:  guestName,
              })
              .eq('id', existing.id)

            if (updateErr) {
              // Likely a conflict with another reservation
              conflictsFound++
            } else {
              eventsUpdated++
            }
          } else {
            eventsSkipped++ // unchanged
          }

          continue
        }

        // 4. New event — check for conflicts with existing reservations
        const { data: conflict } = await supabase
          .from('reservations')
          .select('id')
          .eq('room_id', feed.room_id)
          .not('status', 'in', '("cancelled","no_show")')
          .lt('checkin_at',  checkoutTs)
          .gt('checkout_at', checkinTs)
          .limit(1)
          .single()

        if (conflict) {
          // Conflict with an existing reservation — skip and log
          conflictsFound++
          continue
        }

        // 5. Insert the new reservation
        const { error: insertErr } = await supabase
          .from('reservations')
          .insert({
            room_id:     feed.room_id,
            guest_name:  guestName,
            guest_count: 1,
            checkin_at:  checkinTs,
            checkout_at: checkoutTs,
            source,
            status:         'confirmed',
            payment_method: 'online',
            payment_status: 'unpaid',
            external_id:    event.uid,
            notes: event.description ?? null,
          })

        if (insertErr) {
          // EXCLUDE constraint caught it (race condition)
          conflictsFound++
        } else {
          eventsCreated++
        }
      }

      // 6. Update last_synced_at on the feed
      await supabase
        .from('sync_feeds')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', feed.id)

    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Unknown error'
    }

    // 7. Write sync log
    await supabase.from('sync_logs').insert({
      sync_feed_id:       feed.id,
      started_at:         new Date(logStart).toISOString(),
      finished_at:        new Date().toISOString(),
      status:             errorMessage ? 'error' : 'success',
      events_imported:    eventsCreated,
      events_updated:     eventsUpdated,
      events_skipped:     eventsSkipped,
      error_message:      errorMessage ?? null,
    })

    results.push({
      feedId:         feed.id,
      room:           (feed.rooms as { name: string })?.name,
      platform:       feed.platform,
      created:        eventsCreated,
      updated:        eventsUpdated,
      skipped:        eventsSkipped,
      conflicts:      conflictsFound,
      error:          errorMessage,
    })
  }

  return NextResponse.json({ success: true, results })
}

// Build a full UTC timestamp from a date + local hour offset
// Assumes hotel is in CET/CEST (UTC+1/+2). Using +02:00 (summer time).
// For production, replace with proper timezone handling.
function buildTs(date: Date, localHour: number): string {
  const y   = date.getUTCFullYear()
  const m   = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d   = String(date.getUTCDate()).padStart(2, '0')
  const h   = String(localHour).padStart(2, '0')
  // Offset: +02:00 (CEST). Adjust if your hotel is in a different timezone.
  return `${y}-${m}-${d}T${h}:00:00+02:00`
}
