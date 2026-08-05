import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'
import { formatAddress, hasAddress } from '@/lib/address'

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
  // Structured address, edited by staff during review
  street: string
  postcode: string
  city: string
  country: string
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
    // Match on email when we have one (reliable), otherwise on name.
    // An existing customer gets enriched — we only fill blanks, never
    // overwrite details a staff member entered by hand.
    const uniqueGuests = new Map<string, ConfirmRow>()
    for (const row of toImport) {
      const key = (row.email?.trim().toLowerCase()) || row.guestName.trim().toLowerCase()
      if (key && !uniqueGuests.has(key)) uniqueGuests.set(key, row)
    }
    for (const [, row] of uniqueGuests) {
      const name  = row.guestName.trim()
      const email = row.email?.trim() || null

      const { data: existing } = email
        ? await supabase.from('customers').select('*').ilike('email', email).maybeSingle()
        : await supabase.from('customers').select('*').ilike('name',  name ).maybeSingle()

      const addr = {
        street:   row.street?.trim()   || null,
        postcode: row.postcode?.trim() || null,
        city:     row.city?.trim()     || null,
        country:  row.country?.trim()  || null,
      }

      if (existing) {
        // Fill only the fields that are still empty on the existing record
        const patch: Record<string, unknown> = {}
        if (!existing.email    && email)          patch.email    = email
        if (!existing.phone    && row.phone)      patch.phone    = row.phone.trim()
        if (!existing.street   && addr.street)    patch.street   = addr.street
        if (!existing.postcode && addr.postcode)  patch.postcode = addr.postcode
        if (!existing.city     && addr.city)      patch.city     = addr.city
        if (!existing.country  && addr.country)   patch.country  = addr.country
        if (Object.keys(patch).length > 0) {
          await supabase.from('customers').update(patch).eq('id', existing.id)
        }
      } else {
        await supabase.from('customers').insert({
          name,
          email,
          phone:  row.phone?.trim() || null,
          ...addr,
          source: 'booking.com',
        })
      }
    }

    for (const row of toImport) {
      // Commission → internal_notes (never shown to guest)
      const internalNote = row.commission != null
        ? `Provision Booking.com: €${row.commission.toFixed(2)}`
        : null

      const addr = {
        street:   row.street?.trim()   || '',
        postcode: row.postcode?.trim() || '',
        city:     row.city?.trim()     || '',
        country:  row.country?.trim()  || '',
      }

      const baseData = {
        guest_name:         row.guestName.trim(),
        guest_email:        row.email    || null,
        guest_phone:        row.phone    || null,
        checkin_at:         `${row.checkin}T${row.checkinTime}:00+00`,
        checkout_at:        `${row.checkout}T${row.checkoutTime}:00+00`,
        guest_count:        row.adults + row.children,
        child_count:        row.children,
        breakfast_included: row.breakfast,
        total_price:        row.totalPrice,
        payment_status:     row.paymentStatus,
        payment_method:     row.paymentMethod,
        source:             'booking_com',
        status:             'confirmed',
        external_id:        row.bookingNumber,
        notes:              row.notes    || null,
        internal_notes:     internalNote,
        // Structured address fields — kept in sync with the legacy blob
        guest_street:       addr.street   || null,
        guest_postcode:     addr.postcode || null,
        guest_city:         addr.city     || null,
        guest_country:      addr.country  || null,
        billing_address:    hasAddress(addr) ? formatAddress(addr) : null,
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
