import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface ConfirmRow {
  roomId: string
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
  familyBookingId: string | null   // set when this is part of a family room pair
}

export async function POST(req: NextRequest) {
  try {
    const { rows }: { rows: ConfirmRow[] } = await req.json()
    const supabase = await createClient()

    const toImport = rows.filter(r => !r.skip && r.roomId && r.roomId !== '__DUPLICATE__')
    const results: Array<{ bookingNumber: string; ok: boolean; error?: string }> = []

    for (const row of toImport) {
      // Commission → internal_notes (never shown to guest)
      const internalNote = row.commission != null
        ? `Provision Booking.com: €${row.commission.toFixed(2)}`
        : null

      const { error } = await supabase.from('reservations').insert({
        room_id:            row.roomId,
        guest_name:         row.guestName.trim(),
        guest_email:        row.email  || null,
        guest_phone:        row.phone  || null,
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
        notes:              row.notes  || null,   // clean guest notes only
        internal_notes:     internalNote,          // commission info
        billing_address:    row.adresse || null,   // address for invoices
        family_booking_id:  row.familyBookingId || null,  // links connecting room pair
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
