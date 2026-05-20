import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import type { ReservationWithRoom } from '@/types/database'
import { formatDate, formatDateTime } from '@/lib/reservations'
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
      {/* Print-only styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 15mm; }
          body { font-size: 13px; }
        }
        body { background: white; }
      `}</style>

      {/* Print button (hidden when printing) */}
      <div className="no-print flex items-center gap-3 px-8 pt-6 pb-2 bg-slate-50 border-b border-slate-200">
        <button
          onClick={undefined}
          id="printBtn"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          🖨️ Drucken / Als PDF speichern
        </button>
        <a href={`/reservations`} className="text-sm text-slate-500 hover:text-slate-700">← Zurück</a>
      </div>

      {/* Confirmation document */}
      <div className="max-w-2xl mx-auto px-8 py-10 bg-white min-h-screen">

        {/* Header */}
        <div className="flex items-center justify-between mb-8 pb-6 border-b-2 border-slate-200">
          <div className="bg-slate-800 rounded-xl px-6 py-3">
            <Image src="/logo.png" alt="Jägerstieg Hotel & Pension" width={140} height={70} className="object-contain" />
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Buchungsbestätigung</p>
            <p className="text-2xl font-bold text-slate-900">#{r.id.slice(0, 8).toUpperCase()}</p>
            <p className="text-xs text-slate-400 mt-1">Erstellt: {formatDateTime(r.created_at)}</p>
          </div>
        </div>

        {/* Hotel address */}
        <div className="mb-6 text-sm text-slate-500">
          <p className="font-semibold text-slate-700">Jägerstieg Hotel &amp; Pension</p>
          <p>info@jaegerstieg.de</p>
        </div>

        {/* Guest + Room side by side */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Gast</p>
            <p className="font-semibold text-slate-900 text-base">{r.guest_name}</p>
            {r.guest_email && <p className="text-sm text-slate-600 mt-1">{r.guest_email}</p>}
            {r.guest_phone && <p className="text-sm text-slate-600">{r.guest_phone}</p>}
            <p className="text-sm text-slate-600 mt-1">{r.guest_count} Person{r.guest_count !== 1 ? 'en' : ''}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Zimmer</p>
            <p className="font-semibold text-slate-900 text-base">{r.rooms.name}</p>
            <p className="text-sm text-slate-600">Zimmer {r.rooms.room_number}</p>
            <p className="text-sm text-slate-600">{r.rooms.room_types.name}</p>
            {r.breakfast_included && (
              <span className="inline-flex mt-2 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium">☕ Frühstück inklusive</span>
            )}
          </div>
        </div>

        {/* Dates */}
        <div className="bg-blue-50 rounded-xl p-4 mb-6 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-400 mb-1">Check-in</p>
            <p className="font-bold text-slate-900">{formatDateTime(r.checkin_at)}</p>
          </div>
          <div className="border-x border-blue-200">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-400 mb-1">Nächte</p>
            <p className="font-bold text-slate-900 text-2xl">{nights}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-blue-400 mb-1">Check-out</p>
            <p className="font-bold text-slate-900">{formatDateTime(r.checkout_at)}</p>
          </div>
        </div>

        {/* Payment */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Row label="Buchungsquelle"   value={SOURCE_LABELS[r.source] ?? r.source} />
          <Row label="Zahlungsmethode"  value={PAY_METHOD_LABELS[r.payment_method] ?? r.payment_method} />
          <Row label="Zahlungsstatus"   value={PAY_STATUS_LABELS[r.payment_status] ?? r.payment_status} />
          <Row label="Gesamtpreis"      value={r.total_price != null ? `€${r.total_price.toFixed(2)}` : '—'} highlight />
        </div>

        {/* Notes */}
        {r.notes && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
            <p className="text-xs font-bold uppercase tracking-wide text-yellow-600 mb-1">Notizen</p>
            <p className="text-sm text-slate-700">{r.notes}</p>
          </div>
        )}

        {/* Locker PIN — every room has its own locker */}
        <div className="bg-slate-900 text-white rounded-xl p-5 mb-6">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">🔐 Ihr Schließfach</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">Schließfach Nr.</p>
              <p className="text-2xl font-bold">{r.rooms.room_number}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-300">PIN-Code</p>
              <p className="text-3xl font-bold font-mono tracking-widest">{r.rooms.locker_pin}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">Bitte bewahren Sie diesen Code vertraulich auf.</p>
        </div>

        {/* External ID */}
        {r.external_id && (
          <p className="text-xs text-slate-400 mb-4">Externe Buchungs-ID: {r.external_id}</p>
        )}

        {/* Footer */}
        <div className="border-t border-slate-200 pt-4 mt-6 text-xs text-slate-400 text-center space-y-1">
          <p>Wir freuen uns auf Ihren Besuch! · Jägerstieg Hotel &amp; Pension</p>
          <p>info@jaegerstieg.de</p>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        document.getElementById('printBtn')?.addEventListener('click', () => window.print())
      `}} />
    </>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500 font-medium">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-blue-700' : 'text-slate-800'}`}>{value}</span>
    </div>
  )
}
