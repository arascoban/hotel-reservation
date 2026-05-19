import { createClient } from '@/lib/supabase/server'
import ReservationTable from '@/components/Reservations/ReservationTable'
import type { ReservationWithRoom } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function UnpaidPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('reservations')
    .select('*, rooms(*, room_types(*))')
    .in('payment_status', ['unpaid', 'deposit_paid'])
    .not('status', 'in', '("cancelled","no_show","checked_out")')
    .order('checkin_at', { ascending: true })

  const reservations = (data ?? []) as ReservationWithRoom[]

  const unpaid   = reservations.filter(r => r.payment_status === 'unpaid')
  const deposits = reservations.filter(r => r.payment_status === 'deposit_paid')

  const totalOwed = reservations.reduce((sum, r) => sum + (r.total_price ?? 0), 0)

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Offene Zahlungen</h1>
        <p className="text-slate-500 mt-1">
          Aktive Reservierungen mit offenen oder Teilzahlungen.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 mb-4">
          Fehler beim Laden der offenen Zahlungen.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Vollständig unbezahlt" value={unpaid.length}   suffix="Reservierungen" color="red" />
        <StatCard label="Nur Anzahlung"          value={deposits.length} suffix="Reservierungen" color="amber" />
        <StatCard label="Offener Betrag"         value={totalOwed}       suffix="€"              color="slate" money />
      </div>

      <ReservationTable reservations={reservations} />
    </div>
  )
}

function StatCard({
  label, value, suffix, color, money,
}: {
  label: string; value: number; suffix: string; color: string; money?: boolean
}) {
  const colorMap: Record<string, string> = {
    red:   'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-3xl font-bold">
        {money ? value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}
        <span className="text-lg font-medium ml-1">{suffix}</span>
      </p>
      <p className="text-sm mt-1 opacity-80">{label}</p>
    </div>
  )
}
