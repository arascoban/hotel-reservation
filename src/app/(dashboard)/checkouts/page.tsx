import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import ReservationTable from '@/components/Reservations/ReservationTable'
import type { ReservationWithRoom } from '@/types/database'
import { isAdminUser, deduplicateReservations } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export default async function CheckOutsPage() {
  const supabase = await createClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  // Determine admin status server-side
  const { data: { user } } = await supabase.auth.getUser()
  const isAdmin = isAdminUser(user?.email)

  let q = supabase
    .from('reservations')
    .select('*, rooms(*, room_types(*))')
    .gte('checkout_at', `${today}T00:00:00`)
    .lt('checkout_at',  `${today}T23:59:59`)
    .in('status', ['confirmed', 'checked_in', 'checked_out'])
    .order('checkout_at')

  if (!isAdmin) q = (q as typeof q).is('deleted_at', null)

  const { data, error } = await q

  const reservations = deduplicateReservations(
    (data ?? []) as ReservationWithRoom[],
    isAdmin,
  )

  const stillinRoom  = reservations.filter(r => r.status === 'checked_in')
  const departed     = reservations.filter(r => r.status === 'checked_out')

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Heutige Abreisen</h1>
        <p className="text-slate-500 mt-1">
          {format(new Date(), 'EEEE, d. MMMM yyyy', { locale: de })} · {reservations.length} Abreise{reservations.length !== 1 ? 'n' : ''}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 mb-4">
          Fehler beim Laden der Abreisen.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Abreisen gesamt"    value={reservations.length} color="blue" />
        <StatCard label="Noch im Zimmer"     value={stillinRoom.length}  color="amber" />
        <StatCard label="Bereits ausgecheckt" value={departed.length}    color="green" />
      </div>

      <ReservationTable reservations={reservations} />
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue:  'bg-blue-50 border-blue-200 text-blue-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    green: 'bg-green-50 border-green-200 text-green-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm mt-1 opacity-80">{label}</p>
    </div>
  )
}
