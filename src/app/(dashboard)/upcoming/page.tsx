import { createClient } from '@/lib/supabase/server'
import { format, addDays } from 'date-fns'
import { de } from 'date-fns/locale'
import ReservationTable from '@/components/Reservations/ReservationTable'
import type { ReservationWithRoom } from '@/types/database'
import { isAdminUser, deduplicateReservations } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export default async function UpcomingPage() {
  const supabase = await createClient()

  // Determine admin status server-side
  const { data: { user } } = await supabase.auth.getUser()
  const isAdmin = isAdminUser(user?.email)

  const today    = new Date()
  const from     = format(today,            'yyyy-MM-dd')
  const to       = format(addDays(today, 14), 'yyyy-MM-dd')

  let q = supabase
    .from('reservations')
    .select('*, rooms(*, room_types(*))')
    .gte('checkin_at', `${from}T00:00:00`)
    .lte('checkin_at', `${to}T23:59:59`)
    .in('status', ['confirmed', 'checked_in'])
    .order('checkin_at', { ascending: true })

  if (!isAdmin) q = (q as typeof q).is('deleted_at', null)

  const { data, error } = await q

  const reservations = deduplicateReservations(
    (data ?? []) as ReservationWithRoom[],
    isAdmin,
  )

  // Group by date for a nicer display
  const today0   = reservations.filter(r => r.checkin_at.startsWith(from))
  const upcoming = reservations.filter(r => !r.checkin_at.startsWith(from))

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Bevorstehende Ankünfte</h1>
        <p className="text-slate-500 mt-1">
          Ankünfte in den nächsten 14 Tagen ·{' '}
          {format(today, 'd. MMMM', { locale: de })} – {format(addDays(today, 14), 'd. MMMM yyyy', { locale: de })}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 mb-4">
          Fehler beim Laden der Ankünfte.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Ankünfte gesamt"  value={reservations.length} color="blue" />
        <StatCard label="Heute"            value={today0.length}       color="green" />
        <StatCard label="In den nächsten 14 Tagen" value={upcoming.length} color="amber" />
      </div>

      {reservations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-slate-500 text-sm">
            Keine bevorstehenden Ankünfte in den nächsten 14 Tagen.
          </p>
        </div>
      ) : (
        <ReservationTable reservations={reservations} />
      )}
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
