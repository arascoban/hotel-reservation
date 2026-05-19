import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import ReservationTable from '@/components/Reservations/ReservationTable'
import type { ReservationWithRoom } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function CheckOutsPage() {
  const supabase = await createClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  // Reservations checking out today
  const { data, error } = await supabase
    .from('reservations')
    .select('*, rooms(*, room_types(*))')
    .gte('checkout_at', `${today}T00:00:00`)
    .lt('checkout_at',  `${today}T23:59:59`)
    .in('status', ['confirmed', 'checked_in', 'checked_out'])
    .order('checkout_at')

  const reservations = (data ?? []) as ReservationWithRoom[]

  const stillinRoom  = reservations.filter(r => r.status === 'checked_in')
  const departed     = reservations.filter(r => r.status === 'checked_out')
  const notCheckedIn = reservations.filter(r => r.status === 'confirmed')

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Today's Departures</h1>
        <p className="text-slate-500 mt-1">
          {format(new Date(), 'EEEE, d MMMM yyyy')} · {reservations.length} departure{reservations.length !== 1 ? 's' : ''}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 mb-4">
          Failed to load departures.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total departures"      value={reservations.length} color="blue" />
        <StatCard label="Still in room"         value={stillinRoom.length}  color="amber" />
        <StatCard label="Already checked out"   value={departed.length}     color="green" />
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
