/**
 * GET /api/invoices/:id/pdf — the invoice as a real, vector PDF.
 *
 * Test route for the new renderer. The existing capture path is untouched:
 * this sits alongside it so the two can be compared on the same invoice.
 */

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { invoiceMath } from '@/lib/invoiceMath'
import { InvoicePdf, registerInvoiceFonts, loadLogoDataUri } from '@/lib/invoicePdfDoc'
import { storedDate } from '@/lib/reservations'
import type { PaymentRow } from '@/lib/deposit'

export const dynamic = 'force-dynamic'
// react-pdf needs Node APIs (fs, streams) — it cannot run on the edge.
export const runtime = 'nodejs'

function fmtNum(n: number, year: number): string {
  return `R${String(year).slice(-2)}_${String(n).padStart(3, '0')}`
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()

    const { data } = await supabase.from('invoices').select('*').eq('id', params.id).single()
    if (!data) return NextResponse.json({ error: 'Rechnung nicht gefunden' }, { status: 404 })
    const inv = data as any

    // Payments on the invoice, plus any taken on its reservation before the
    // invoice existed — exactly what the on-screen document totals.
    const { data: ownPayments } = await supabase
      .from('payments').select('*').eq('invoice_id', params.id)
    const { data: resPayments } = inv.reservation_id
      ? await supabase.from('payments').select('*')
          .eq('reservation_id', inv.reservation_id).is('invoice_id', null)
      : { data: [] as PaymentRow[] }
    const payments = [...(ownPayments ?? []), ...(resPayments ?? [])] as PaymentRow[]

    registerInvoiceFonts()

    const year       = new Date(inv.created_at).getFullYear()
    const invoiceRef = fmtNum(inv.invoice_number, year)

    const buffer = await renderToBuffer(
      InvoicePdf({
        m:               invoiceMath(inv, payments),
        invoiceRef,
        invoiceDate:     storedDate(inv.created_at),
        invoiceDateLong: new Date(inv.created_at).toLocaleDateString('de-DE', {
          timeZone: 'Europe/Berlin', day: 'numeric', month: 'long', year: 'numeric',
        }),
        guestName:  inv.guest_name,
        guestEmail: inv.guest_email ?? null,
        logo:       loadLogoDataUri(),
      }),
    )

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="Rechnung_${invoiceRef}.pdf"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'PDF konnte nicht erzeugt werden.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
