import { createClient } from '@/lib/supabase/server'
import { format, addDays } from 'date-fns'
import { de } from 'date-fns/locale'
import ReservationTable from '@/components/Reservations/ReservationTable'
import type { ReservationWithRoom } from '@/types/database'
import { isAdminUser, deduplicateReservations } from '@/lib/admin'
import CheckinsControls from './CheckinsControls'

// Parse directly from ISO string — no timezone conversion on the server.
// "2025-06-01T13:00:00+02:00" → { date: "01.06.2025", time: "13:00" }
function printDate(iso: string): string {
  const [datePart] = iso.split('T')
  const [y, m, d] = datePart.split('-')
  return `${d}.${m}.${y}`
}
function printTime(iso: string): string {
  return iso.split('T')[1].slice(0, 5)
}

export const dynamic = 'force-dynamic'

const PAY_METHOD_LABELS: Record<string, string> = {
  cash:          'Bar',
  ec_card:       'EC-Karte',
  credit_card:   'Kreditkarte',
  card_verified: 'Karte verifiz.',
  online:        'Online',
  unpaid:        '—',
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
          @page { margin: 14mm 12mm; size: A4 landscape; }

          aside, .no-print { display: none !important; }
          .lg\\:ml-64 { margin-left: 0 !important; }
          .print-only { display: block !important; }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            font-size: 10px;
            color: #1e293b;
            background: white;
          }

          /* ── Page header ── */
          .ph {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 14px;
            padding-bottom: 10px;
            border-bottom: 2px solid #1e293b;
          }
          .ph-title  { font-size: 19px; font-weight: 800; margin: 0 0 3px; color: #1e293b; }
          .ph-sub    { font-size: 11px; color: #64748b; margin: 0; }
          .ph-right  { text-align: right; font-size: 9px; color: #94a3b8; line-height: 1.6; }
          .ph-hotel  { font-size: 11px; font-weight: 700; color: #475569; }

          /* ── Stats strip ── */
          .ps { display: flex; gap: 10px; margin-bottom: 14px; }
          .ps-card {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 7px 14px;
            min-width: 90px;
          }
          .ps-val { font-size: 20px; font-weight: 800; color: #1e293b; line-height: 1; }
          .ps-lbl { font-size: 9px; color: #94a3b8; margin-top: 2px; }

          /* ── Table wrapper (rounded corners) ── */
          .pt-wrap {
            border-radius: 10px;
            overflow: hidden;
            border: 1px solid #e2e8f0;
          }

          /* ── Table ── */
          .pt { width: 100%; border-collapse: collapse; }

          .pt thead tr { background: #1e293b; }
          .pt th {
            background: #1e293b;
            color: #cbd5e1;
            font-size: 8.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            padding: 9px 10px;
            text-align: left;
            white-space: nowrap;
            border: none;
          }
          .pt th.center { text-align: center; }
          .pt th.right  { text-align: right; }

          .pt td {
            padding: 9px 10px;
            vertical-align: top;
            border-bottom: 1px solid #f1f5f9;
            color: #1e293b;
          }
          .pt tbody tr:last-child td { border-bottom: none; }
          .pt tbody tr:nth-child(even) td { background: #f8fafc; }
          .pt tbody tr:nth-child(odd)  td { background: #ffffff; }

          /* Column widths */
          .cw-guest  { width: 15%; }
          .cw-room   { width: 14%; }
          .cw-pax    { width: 5%;  text-align: center; }
          .cw-date   { width: 11%; }
          .cw-paid   { width: 10%; }
          .cw-method { width: 9%;  }
          .cw-price  { width: 8%;  text-align: right; }
          .cw-notes  { width: 18%; }

          /* Guest cell */
          .g-name  { font-weight: 700; font-size: 11px; }

          /* Room cell — name + type stacked */
          .r-name  { font-weight: 700; font-size: 11px; }
          .r-type  { font-size: 9px; color: #64748b; margin-top: 2px; }

          /* Date cells — date + time stacked */
          .d-date  { font-weight: 600; font-size: 10px; }
          .d-time  { font-size: 10px; color: #64748b; }

          /* Payment badges */
          .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 20px;
            font-size: 9px;
            font-weight: 700;
            white-space: nowrap;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .b-paid     { background: #dcfce7; color: #166534; }
          .b-deposit  { background: #fef9c3; color: #854d0e; }
          .b-unpaid   { background: #fee2e2; color: #991b1b; }
          .b-refunded { background: #f1f5f9; color: #475569; }

          .pax-center { text-align: center; font-weight: 600; }
          .price-right { text-align: right; font-weight: 600; }
          .notes-cell { font-size: 9px; color: #475569; line-height: 1.5; }

          /* ── Footer ── */
          .pf {
            margin-top: 12px;
            padding-top: 8px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            font-size: 9px;
            color: #94a3b8;
          }
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

        {/* ── Print-only layout ─────────────────────────────────────────── */}
        <div className="print-only">

          {/* Header */}
          <div className="ph">
            <div>
              <p className="ph-title">{title}</p>
              <p className="ph-sub">{subtitle}</p>
            </div>
            <div className="ph-right">
              <p className="ph-hotel">Jägerstieg Hotel &amp; Pension</p>
              <p>Gedruckt: {format(now, 'dd.MM.yyyy HH:mm')}</p>
            </div>
          </div>

          {/* Stats strip */}
          <div className="ps">
            <div className="ps-card">
              <div className="ps-val">{reservations.length}</div>
              <div className="ps-lbl">Erwartet</div>
            </div>
            <div className="ps-card">
              <div className="ps-val">{arriving.length}</div>
              <div className="ps-lbl">Ausstehend</div>
            </div>
            <div className="ps-card">
              <div className="ps-val">{checkedIn.length}</div>
              <div className="ps-lbl">Eingecheckt</div>
            </div>
          </div>

          {reservations.length === 0 ? (
            <p>Keine Ankünfte gefunden.</p>
          ) : (
            <div className="pt-wrap">
              <table className="pt">
                <colgroup>
                  <col className="cw-guest" />
                  <col className="cw-room" />
                  <col className="cw-pax" />
                  <col className="cw-date" />
                  <col className="cw-date" />
                  <col className="cw-paid" />
                  <col className="cw-method" />
                  <col className="cw-price" />
                  <col className="cw-notes" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Gast</th>
                    <th>Zimmer &amp; Typ</th>
                    <th className="center">Pers.</th>
                    <th>Anreise</th>
                    <th>Abreise</th>
                    <th>Bezahlt</th>
                    <th>Zahlungsart</th>
                    <th className="right">Gesamt</th>
                    <th>Interne Notizen</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map(r => {
                    const badgeClass =
                      r.payment_status === 'paid'           ? 'badge b-paid'
                      : r.payment_status === 'deposit_paid' ? 'badge b-deposit'
                      : r.payment_status === 'refunded'     ? 'badge b-refunded'
                      : 'badge b-unpaid'

                    const payLabel =
                      r.payment_status === 'paid'           ? 'Bezahlt'
                      : r.payment_status === 'deposit_paid' ? 'Anzahlung'
                      : r.payment_status === 'refunded'     ? 'Erstattet'
                      : 'Offen'

                    return (
                      <tr key={r.id}>
                        {/* Guest */}
                        <td>
                          <div className="g-name">{r.guest_name}</div>
                        </td>

                        {/* Room + type in one cell */}
                        <td>
                          <div className="r-name">{r.rooms.name} #{r.rooms.room_number}</div>
                          <div className="r-type">{r.rooms.room_types.name}</div>
                        </td>

                        {/* Person count */}
                        <td className="pax-center">{r.guest_count}</td>

                        {/* Check-in: date + time stacked */}
                        <td>
                          <div className="d-date">{printDate(r.checkin_at)}</div>
                          <div className="d-time">{printTime(r.checkin_at)}</div>
                        </td>

                        {/* Check-out: date + time stacked */}
                        <td>
                          <div className="d-date">{printDate(r.checkout_at)}</div>
                          <div className="d-time">{printTime(r.checkout_at)}</div>
                        </td>

                        {/* Payment badge */}
                        <td><span className={badgeClass}>{payLabel}</span></td>

                        {/* Payment method */}
                        <td>{PAY_METHOD_LABELS[r.payment_method] ?? r.payment_method}</td>

                        {/* Total price */}
                        <td className="price-right">
                          {r.total_price != null ? `€${r.total_price.toFixed(2)}` : '—'}
                        </td>

                        {/* Internal notes */}
                        <td className="notes-cell">{r.internal_notes ?? ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          <div className="pf">
            <span>Hotel Management System · Jägerstieg Hotel &amp; Pension</span>
            <span>{reservations.length} Ankunft{reservations.length !== 1 ? 'en' : ''} · {format(now, 'dd.MM.yyyy')}</span>
          </div>
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
