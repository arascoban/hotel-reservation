import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface ConfirmRow {
  roomId: string
  guestName: string
  checkin: string       // YYYY-MM-DD
  checkout: string      // YYYY-MM-DD
  guestCount: number
  totalPrice: number | null
  commission: number | null
  bookingNumber: string
  paymentStatus: string
  paymentMethod: string
  notes: string
  skip: boolean
}

export async function POST(req: NextRequest) {
  try {
    const { rows }: { rows: ConfirmRow[] } = await req.json()
    const supabase = await createClient()

    const toImport = rows.filter(r => !r.skip && r.roomId && r.roomId !== '__DUPLICATE__')
    const results: Array<{ bookingNumber: string; ok: boolean; error?: string }> = []

    for (const row of toImport) {
      // Build note with commission info
      const commissionNote = row.commission != null
        ? `Provision Booking.com: €${row.commission.toFixed(2)}`
        : ''
      const fullNote = [commissionNote, row.notes].filter(Boolean).join(' | ')

      const { error } = await supabase.from('reservations').insert({
        room_id:           row.roomId,
        guest_name:        row.guestName.trim(),
        checkin_at:        `${row.checkin}T13:00:00+00`,
        checkout_at:       `${row.checkout}T09:00:00+00`,
        guest_count:       row.guestCount,
        total_price:       row.totalPrice,
        payment_status:    row.paymentStatus,
        payment_method:    row.paymentMethod,
        source:            'booking_com',
        status:            'confirmed',
        external_id:       row.bookingNumber,
        notes:             fullNote || null,
      })

      results.push({
        bookingNumber: row.bookingNumber,
        ok: !error,
        error: error?.message,
      })
    }

    const succeeded = results.filter(r => r.ok).length
    const failed    = results.filter(r => !r.ok)

    return NextResponse.json({ succeeded, failed })
  } catch (err: any) {
    console.error('Import confirm error:', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}
