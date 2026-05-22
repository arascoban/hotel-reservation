import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import ReservationTable from '@/components/Reservations/ReservationTable'
import type { ReservationWithRoom } from '@/types/database'
import { isAdminUser, deduplicateReservations } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export default async function CheckInsPage() {
  const supabase = await createClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  // Determine admin status server-side
  const { data: { user } } = await supabase.auth.getUser()
  const isAdmin = isAdminUser(user?.email)

  let q = supabase
    .from('reservations')
    .select('*, rooms(*, room_types(*))')
    .gte('checkin_at', `${today}T00:00:00`)
    .lt('checkin_at',  `${today}T23:59:59`)
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

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-8 max-w-6xl mx-auto">
      <div className="mb-5 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Heutige Ankünfte</h1>
        <p className="text-slate-500 mt-1">
          {format(new Date(), 'EEEE, d. MMMM yyyy', { locale: de })} · {reservations.length} Ankunft{reservations.length !== 1 ? 'en' : ''}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 mb-4">
          Fehler beim Laden der Ankünfte.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-5 sm:mb-6">
        <StatCard label="Erwartet heute"      value={reservations.length} color="blue" />
        <StatCard label="Noch ausstehend"      value={arriving.length}     color="amber" />
        <StatCard label="Bereits eingecheckt" value={checkedIn.length}    color="green" />
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
    <div className={`rounded-xl border p-3 sm:p-4 ${colorMap[color]}`}>
      <p className="text-2xl sm:text-3xl font-bold">{value}</p>
      <p className="text-xs sm:text-sm mt-1 opacity-80 leading-tight">{label}</p>
    </div>
  )
}
