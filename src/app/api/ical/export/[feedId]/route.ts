/**
 * GET /api/ical/export/[feedId]
 *
 * Public endpoint — no auth required (the feedId UUID acts as a secret token).
 * Returns a .ics calendar feed with all active reservations for the linked room.
 *
 * Booking.com / Expedia / Airbnb subscribe to this URL.
 * When you create a manual reservation in the app, it will appear in this feed
 * and those platforms will see the room as blocked.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateIcal } from '@/lib/ical'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ feedId: string }> },
) {
  const { feedId } = await params
  const supabase = await createClient()

  // Look up the export feed — validates the feedId token
  const { data: feed, error: feedErr } = await supabase
    .from('sync_feeds')
    .select('id, room_id, is_active, rooms(id, name, room_number)')
    .eq('id', feedId)
    .eq('feed_type', 'export')
    .single()

  if (feedErr || !feed) {
    return new NextResponse('Feed not found', { status: 404 })
  }

  if (!feed.is_active) {
    return new NextResponse('Feed is disabled', { status: 403 })
  }

  const room = feed.rooms as { id: string; name: string; room_number: string }

  // Fetch all active reservations for this room
  const { data: reservations, error: resErr } = await supabase
    .from('reservations')
    .select('id, guest_name, checkin_at, checkout_at, created_at, updated_at')
    .eq('room_id', room.id)
    .not('status', 'in', '("cancelled","no_show")')
    .order('checkin_at')

  if (resErr) {
    return new NextResponse('Failed to load reservations', { status: 500 })
  }

  const icalContent = generateIcal(
    `${room.name} (#${room.room_number})`,
    reservations ?? [],
  )

  return new NextResponse(icalContent, {
    status: 200,
    headers: {
      'Content-Type':        'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="room-${room.room_number}.ics"`,
      'Cache-Control':       'no-store, no-cache',
    },
  })
}
