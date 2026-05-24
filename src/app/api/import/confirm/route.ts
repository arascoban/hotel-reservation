import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

interface ConfirmRow {
  roomId: string
  secondRoomId?: string | null   // set for family bookings → creates TWO reservations
  guestName: string
  checkin: string       // YYYY-MM-DD
  checkout: string      // YYYY-MM-DD
  checkinTime: string   // HH:MM
  checkoutTime: string  // HH:MM
  adults: number
  children: number
  totalPrice: number | null
  commission: number | null
  bookingNumber: string
  paymentStatus: string
  paymentMethod: string
  notes: string         // guest-visible notes (Bemerkungen)
  adresse: string       // saved to billing_address column
  breakfast: boolean
  email: string
  phone: string
  skip: boolean
  familyBookingId: string | null   // legacy field (ignored when secondRoomId present)
}

export async function POST(req: NextRequest) {
  try {
    const { rows }: { rows: ConfirmRow[] } = await req.json()
    const supabase = await createClient()

    const toImport = rows.filter(r => !r.skip && r.roomId && r.roomId !== '__DUPLICATE__')
    const results: Array<{ bookingNumber: string; ok: boolean; error?: string }> = []

    // ── Upsert customers for all imported guests ──────────────────────────────
    // We upsert by lower(name) — if a customer with the same name already exists, skip.
    const uniqueGuests = new Map<string, ConfirmRow>()
    for (const row of toImport) {
      const key = row.guestName.trim().toLowerCase()
      if (key && !uniqueGuests.has(key)) uniqueGuests.set(key, row)
    }
    for (const [, row] of uniqueGuests) {
      // Only insert if no existing customer with same name exists
      const { data: existing } = await supabase
        .from('customers')
        .select('id')
        .ilike('name', row.guestName.trim())
        .maybeSingle()
      if (!existing) {
        await supabase.from('customers').insert({
          name:    row.guestName.trim(),
          email:   row.email   || null,
          phone:   row.phone   || null,
          street:  row.adresse || null,
          source:  'booking.com',
        })
      }
    }

    for (const row of toImport) {
      // Commission → internal_notes (never shown to guest)
      const internalNote = row.commission != null
        ? `Provision Booking.com: €${row.commission.toFixed(2)}`
        : null

      const baseData = {
        guest_name:         row.guestName.trim(),
        guest_email:        row.email    || null,
        guest_phone:        row.phone    || null,
        checkin_at:         `${row.checkin}T${row.checkinTime}:00+00`,
        checkout_at:        `${row.checkout}T${row.checkoutTime}:00+00`,
        guest_count:        row.adults + row.children,
        breakfast_included: row.breakfast,
        total_price:        row.totalPrice,
        payment_status:     row.paymentStatus,
        payment_method:     row.paymentMethod,
        source:             'booking_com',
        status:             'confirmed',
        external_id:        row.bookingNumber,
        notes:              row.notes    || null,
        internal_notes:     internalNote,
        billing_address:    row.adresse  || null,
        guest_street:       row.adresse  || null,   // structured street field
      }

      // ── Family booking: insert TWO reservations linked by a shared family_booking_id ──
      if (row.secondRoomId) {
        const familyId = randomUUID()

        const { error: e1 } = await supabase.from('reservations').insert({
          ...baseData,
          room_id:           row.roomId,
          family_booking_id: familyId,
        })
        const { error: e2 } = await supabase.from('reservations').insert({
          ...baseData,
          room_id:           row.secondRoomId,
          family_booking_id: familyId,
        })

        const ok = !e1 && !e2
        results.push({
          bookingNumber: row.bookingNumber,
          ok,
          error: e1?.message ?? e2?.message,
        })
        continue
      }

      // ── Regular single-room booking ───────────────────────────────────────
      const { error } = await supabase.from('reservations').insert({
        ...baseData,
        room_id:           row.roomId,
        family_booking_id: row.familyBookingId || null,
      })

      results.push({ bookingNumber: row.bookingNumber, ok: !error, error: error?.message })
    }

    const succeeded = results.filter(r => r.ok).length
    const failed    = results.filter(r => !r.ok)

    return NextResponse.json({ succeeded, failed })
  } catch (err: any) {
    console.error('Import confirm error:', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}
