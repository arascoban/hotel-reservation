import { createClient } from '@/lib/supabase/server'
import { format, subDays, addDays } from 'date-fns'
import { de } from 'date-fns/locale'
import CheckoutsList from './CheckoutsList'
import type { ReservationWithRoom } from '@/types/database'
import { isAdminUser, deduplicateReservations } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export default async function CheckOutsPage() {
  const supabase   = await createClient()
  const now        = new Date()
  const today      = format(now, 'yyyy-MM-dd')
  const overmorrow = format(addDays(now, 2), 'yyyy-MM-dd')   // day after tomorrow
  const fromDate   = format(subDays(now, 29), 'yyyy-MM-dd')  // 30-day archive for admin

  const { data: { user } } = await supabase.auth.getUser()
  const isAdmin = isAdminUser(user?.email)

  // Fetch past (archive) + today + tomorrow + day-after-tomorrow
  let q = supabase
    .from('reservations')
    .select('*, rooms(*, room_types(*))')
    .gte('checkout_at', `${fromDate}T00:00:00`)
    .lte('checkout_at', `${overmorrow}T23:59:59`)
    .in('status', ['confirmed', 'checked_in', 'checked_out'])
    .order('checkout_at', { ascending: true })

  if (!isAdmin) q = (q as typeof q).is('deleted_at', null)

  const { data, error } = await q

  const reservations = deduplicateReservations(
    (data ?? []) as ReservationWithRoom[],
    isAdmin,
  )

  const pending  = reservations.filter(r => r.status !== 'checked_out')
  const departed = reservations.filter(r => r.status === 'checked_out')

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-8 max-w-6xl mx-auto">
      <div className="mb-5 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Abreisen</h1>
        <p className="text-slate-500 mt-1">
          Heute, Morgen &amp; Übermorgen · {format(now, 'EEEE, d. MMMM yyyy', { locale: de })}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 mb-4">
          Fehler beim Laden der Abreisen.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-5 sm:mb-6">
        <StatCard label="Ausstehend"         value={pending.length}  color="amber" />
        <StatCard label="Bereits ausgecheckt" value={departed.length} color="green" />
        <StatCard label="Gesamt (3 Tage)"    value={reservations.length} color="blue" />
      </div>

      <CheckoutsList initialReservations={reservations} today={today} />
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
