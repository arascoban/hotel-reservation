import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import type { ReservationWithRoom } from '@/types/database'
import { formatDate, formatDateTime, getRoomFloor } from '@/lib/reservations'
import PrintButton from './PrintButton'
import { differenceInCalendarDays } from 'date-fns'

export const dynamic = 'force-dynamic'

const PAY_METHOD_LABELS: Record<string, string> = {
  cash: 'Bargeld', ec_card: 'EC-Karte', credit_card: 'Kreditkarte',
  online: 'Online', unpaid: 'Noch nicht bezahlt',
}
const PAY_STATUS_LABELS: Record<string, string> = {
  paid: 'Bezahlt', deposit_paid: 'Anzahlung bezahlt',
  unpaid: 'Ausstehend', refunded: 'Erstattet',
}
const SOURCE_LABELS: Record<string, string> = {
  booking_com: 'Booking.com', expedia: 'Expedia', airbnb: 'Airbnb',
  walk_in: 'Laufkundschaft', phone: 'Telefon', website: 'Website', other: 'Sonstige',
}

export default async function PrintPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  const { data: resData } = await supabase
    .from('reservations')
    .select('*, rooms(*, room_types(*))')
    .eq('id', params.id)
    .single()

  if (!resData) notFound()
  const r = resData as ReservationWithRoom

  const nights = differenceInCalendarDays(new Date(r.checkout_at), new Date(r.checkin_at))

  return (
    <>
      {/* ── Global print styles ───────────────────────────────────────────────── */}
      <style>{`
        @media print {
          /* Hide everything that isn't the confirmation */
          .no-print { display: none !important; }
          aside, nav, header { display: none !important; }
          /* Remove sidebar margin offset */
          .lg\\:ml-64, [class*="ml-64"] { margin-left: 0 !important; }
          /* Remove min-height so content doesn't force a second page */
          .print-doc { min-height: 0 !important; }
          /* Keep colour backgrounds (Chrome strips them by default) */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { margin: 12mm; size: A4 portrait; }
          body { background: white !important; font-size: 12px; margin: 0 !important; }
        }
        body { background: #f8fafc; }
      `}</style>

      {/* ── On-screen toolbar (hidden when printing) ─────────────────────────── */}
      <div className="no-print flex items-center gap-3 px-6 pt-5 pb-3 bg-white border-b border-slate-200">
        <PrintButton />
        <a href="/reservations" className="text-sm text-slate-500 hover:text-slate-700">← Zurück</a>
      </div>

      {/* ── Confirmation document ─────────────────────────────────────────────── */}
      <div className="print-doc max-w-xl mx-auto px-8 py-8 bg-white">

        {/* Header row */}
        <div className="flex items-center justify-between mb-6 pb-5 border-b-2 border-slate-200">
          <div className="bg-slate-800 rounded-xl px-5 py-2.5">
            <Image src="/logo.png" alt="Jägerstieg Hotel & Pension" width={120} height={60} className="object-contain" />
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Buchungsbestätigung</p>
            <p className="text-2xl font-bold text-slate-900">#{r.id.slice(0, 8).toUpperCase()}</p>
            <p className="text-xs text-slate-400 mt-0.5">Erstellt: {formatDateTime(r.created_at)}</p>
          </div>
        </div>

        {/* Hotel contact */}
        <div className="mb-4 text-xs text-slate-500">
          <p className="font-semibold text-slate-700">Jägerstieg Hotel &amp; Pension</p>
          <p>info@jaegerstieg.de</p>
        </div>

        {/* Guest info — single row */}
        <div className="bg-slate-50 rounded-xl p-4 mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">Gast</p>
            <p className="font-semibold text-slate-900">{r.guest_name}</p>
            {r.guest_email && <p className="text-xs text-slate-500 mt-0.5">{r.guest_email}</p>}
            {r.guest_phone && <p className="text-xs text-slate-500">{r.guest_phone}</p>}
            <p className="text-xs text-slate-500 mt-0.5">{r.guest_count} Person{r.guest_count !== 1 ? 'en' : ''}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">Zimmer</p>
            <p className="font-semibold text-slate-900">{r.rooms.name}</p>
            <p className="text-xs text-slate-500">{getRoomFloor(r.rooms.room_number)} · {r.rooms.room_types.name}</p>
            {r.breakfast_included && (
              <span className="inline-flex mt-1.5 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium">
                ☕ Frühstück inkl.
              </span>
            )}
          </div>
        </div>

        {/* Dates — 3 columns */}
        <div className="bg-blue-50 rounded-xl p-4 mb-4 flex items-center justify-between text-center gap-4">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-400 mb-1">Check-in</p>
            <p className="font-bold text-slate-900 text-sm">{formatDateTime(r.checkin_at)}</p>
          </div>
          <div className="flex-1 border-x border-blue-200 px-4">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-400 mb-1">Nächte</p>
            <p className="font-bold text-slate-900 text-2xl">{nights}</p>
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-400 mb-1">Check-out</p>
            <p className="font-bold text-slate-900 text-sm">{formatDateTime(r.checkout_at)}</p>
          </div>
        </div>

        {/* Payment — compact 4-cell table */}
        <div className="rounded-xl border border-slate-200 mb-4 overflow-hidden">
          <div className="grid grid-cols-4 divide-x divide-slate-200">
            <Cell label="Buchungsquelle" value={SOURCE_LABELS[r.source] ?? r.source} />
            <Cell label="Zahlungsart"    value={PAY_METHOD_LABELS[r.payment_method] ?? r.payment_method} />
            <Cell label="Status"         value={PAY_STATUS_LABELS[r.payment_status] ?? r.payment_status} />
            <Cell label="Gesamtpreis"    value={r.total_price != null ? `€${r.total_price.toFixed(2)}` : '—'} highlight />
          </div>
        </div>

        {/* Notes */}
        {r.notes && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4">
            <p className="text-xs font-bold uppercase tracking-wide text-yellow-600 mb-1">Notizen</p>
            <p className="text-xs text-slate-700">{r.notes}</p>
          </div>
        )}

        {/* Locker / Key pickup */}
        <div className="bg-slate-900 text-white rounded-xl p-5 mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">🔐 Schlüsselabholung</p>
          <p className="text-sm text-slate-300 mb-4">
            Ihre Zimmerschlüssel befinden sich im Schließfach Nr.&nbsp;
            <strong className="text-white">{r.rooms.room_number}</strong> an der Rezeption.
            Bitte öffnen Sie das Schließfach mit dem folgenden PIN-Code:
          </p>
          <div className="flex items-center justify-between bg-slate-800 rounded-xl px-5 py-4">
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Schließfach Nr.</p>
              <p className="text-3xl font-bold text-white">{r.rooms.room_number}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 mb-0.5">Ihr PIN-Code</p>
              <p className="text-4xl font-black font-mono tracking-[0.3em] text-white">{r.rooms.locker_pin}</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">Bitte bewahren Sie diesen Code vertraulich auf.</p>
        </div>

        {/* External ID */}
        {r.external_id && (
          <p className="text-xs text-slate-400 mb-3">Externe Buchungs-ID: {r.external_id}</p>
        )}

        {/* Footer */}
        <div className="border-t border-slate-200 pt-3 text-xs text-slate-400 text-center space-y-0.5">
          <p>Wir freuen uns auf Ihren Besuch! · Jägerstieg Hotel &amp; Pension</p>
          <p>info@jaegerstieg.de</p>
        </div>
      </div>

    </>
  )
}

function Cell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="p-3">
      <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-blue-700' : 'text-slate-800'}`}>{value}</p>
    </div>
  )
}
