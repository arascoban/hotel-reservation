import { createClient } from '@/lib/supabase/server'
import { format, addDays } from 'date-fns'
import { de } from 'date-fns/locale'
import ReservationTable from '@/components/Reservations/ReservationTable'
import type { ReservationWithRoom } from '@/types/database'
import { isAdminUser, deduplicateReservations } from '@/lib/admin'
import CheckinsControls from './CheckinsControls'

// Reads date+time directly from the stored ISO string so no timezone
// conversion happens on the server (timestamps are stored as +02:00).
// "2025-06-01T13:00:00+02:00" → "01.06.2025 13:00"
function printDateTime(iso: string): string {
  const [datePart, rest] = iso.split('T')
  const [y, m, d] = datePart.split('-')
  const time = rest.slice(0, 5)
  return `${d}.${m}.${y} ${time}`
}

export const dynamic = 'force-dynamic'

const PAY_METHOD_LABELS: Record<string, string> = {
  cash:         'Bar',
  ec_card:      'EC-Karte',
  credit_card:  'Kreditkarte',
  online:       'Online',
  unpaid:       '—',
}

export default async function CheckInsPage({
  searchParams,
}: {
  searchParams: { view?: string }
}) {
  const supabase = await createClient()
  const now      = new Date()
  const today    = format(now, 'yyyy-MM-dd')
  const isWeekView = searchParams.view === 'week'
  const endDate  = format(addDays(now, 7), 'yyyy-MM-dd')

  const { data: { user } } = await supabase.auth.getUser()
  const isAdmin = isAdminUser(user?.email)

  let q = supabase
    .from('reservations')
    .select('*, rooms(*, room_types(*))')
    .gte('checkin_at', `${today}T00:00:00`)
    .lte('checkin_at', isWeekView ? `${endDate}T23:59:59` : `${today}T23:59:59`)
    .in('status', ['confirmed', 'checked_in'])
    .order('checkin_at')

  if (!isAdmin) q = (q as typeof q).is('deleted_at', null)

  const { data, error } = await q

  const reservations = deduplicateReservations(
    (data ?? []) as ReservationWithRoom[],
    isAdmin,
  )

  const arriving  = reservations.filter(r => r.status === 'confirmed')
  const checkedIn = reservations.filter(r => r.status === 'checked_in')

  const title = isWeekView ? 'Bevorstehende Ankünfte – 7 Tage' : 'Heutige Ankünfte'
  const subtitle = isWeekView
    ? `${format(now, 'd. MMMM', { locale: de })} – ${format(addDays(now, 7), 'd. MMMM yyyy', { locale: de })} · ${reservations.length} Ankunft${reservations.length !== 1 ? 'en' : ''}`
    : `${format(now, 'EEEE, d. MMMM yyyy', { locale: de })} · ${reservations.length} Ankunft${reservations.length !== 1 ? 'en' : ''}`

  return (
    <>
      {/* ── Print-only styles ────────────────────────────────────────────── */}
      <style>{`
        @media print {
          aside, .no-print { display: none !important; }
          .lg\\:ml-64 { margin-left: 0 !important; }
          .print-only { display: block !important; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #000; }

          .print-header { margin-bottom: 12px; }
          .print-header h2 { font-size: 17px; margin: 0 0 2px; }
          .print-header p  { font-size: 11px; margin: 0; color: #555; }

          .print-table { width: 100%; border-collapse: collapse; margin-top: 0; }
          .print-table th,
          .print-table td { border: 1px solid #bbb; padding: 5px 7px; text-align: left; vertical-align: top; word-break: break-word; }
          .print-table th { background: #e8e8e8; font-weight: bold; font-size: 10px; white-space: nowrap; }
          .print-table tr:nth-child(even) td { background: #f7f7f7; }

          .pay-yes     { color: #166534; font-weight: 600; }
          .pay-deposit { color: #854d0e; font-weight: 600; }
          .pay-no      { color: #991b1b; font-weight: 600; }

          .notes-cell { max-width: 180px; font-size: 10px; color: #444; }
        }

        /* Hidden on screen */
        .print-only { display: none; }
      `}</style>

      <div className="px-4 py-5 sm:px-6 sm:py-8 max-w-6xl mx-auto">

        {/* ── Screen header ─────────────────────────────────────────────── */}
        <div className="mb-5 sm:mb-6 no-print">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h1>
              <p className="text-slate-500 mt-1">{subtitle}</p>
            </div>
            <CheckinsControls isWeekView={isWeekView} />
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 mb-4 no-print">
            Fehler beim Laden der Ankünfte.
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-5 sm:mb-6 no-print">
          <StatCard label="Erwartet"     value={reservations.length} color="blue" />
          <StatCard label="Ausstehend"   value={arriving.length}     color="amber" />
          <StatCard label="Eingecheckt"  value={checkedIn.length}    color="green" />
        </div>

        <div className="no-print">
          <ReservationTable reservations={reservations} />
        </div>

        {/* ── Print-only table ──────────────────────────────────────────── */}
        <div className="print-only">
          <div className="print-header">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          {reservations.length === 0 ? (
            <p>Keine Ankünfte gefunden.</p>
          ) : (
            <table className="print-table">
              <thead>
                <tr>
                  <th>Gast</th>
                  <th>Zimmer</th>
                  <th>Zimmertyp</th>
                  <th>Personen</th>
                  <th>Anreise</th>
                  <th>Abreise</th>
                  <th>Bezahlt</th>
                  <th>Zahlungsart</th>
                  <th>Gesamtpreis</th>
                  <th>Interne Notizen</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map(r => {
                  const payClass =
                    r.payment_status === 'paid'           ? 'pay-yes'
                    : r.payment_status === 'deposit_paid' ? 'pay-deposit'
                    : 'pay-no'

                  const payLabel =
                    r.payment_status === 'paid'           ? 'Ja'
                    : r.payment_status === 'deposit_paid' ? 'Anzahlung'
                    : r.payment_status === 'refunded'     ? 'Erstattet'
                    : 'Nein'

                  return (
                    <tr key={r.id}>
                      <td>{r.guest_name}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {r.rooms.name}&nbsp;#{r.rooms.room_number}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.rooms.room_types.name}</td>
                      <td style={{ textAlign: 'center' }}>{r.guest_count}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{printDateTime(r.checkin_at)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{printDateTime(r.checkout_at)}</td>
                      <td className={payClass}>{payLabel}</td>
                      <td>{PAY_METHOD_LABELS[r.payment_method] ?? r.payment_method}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {r.total_price != null ? `€${r.total_price.toFixed(2)}` : '—'}
                      </td>
                      <td className="notes-cell">{r.internal_notes ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue:  'bg-blue-50 border-blue-200 text-blue-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    green: 'bg-green-50 border-green-200 text-green-700',
  }
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${colorMap[color]}`}>
      <p className="text-2xl sm:text-3xl font-bold">{value}</p>
      <p className="text-xs sm:text-sm mt-1 opacity-80 leading-tight">{label}</p>
    </div>
  )
}
