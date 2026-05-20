import { createClient } from '@/lib/supabase/server'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import CalendarGrid from '@/components/Calendar/CalendarGrid'
import type { CalendarReservation } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Fetch full current month for the monthly calendar view
  const monthStart = startOfMonth(new Date())
  const monthEnd   = endOfMonth(new Date())

  const [roomsResult, reservationsResult] = await Promise.all([
    supabase
      .from('rooms')
      .select('id, name, room_number, floor, sort_order, room_types(id, category, name, sort_order)')
      .eq('is_active', true)
      .order('sort_order'),

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_calendar_reservations', {
      p_from: format(monthStart, 'yyyy-MM-dd'),
      p_to:   format(monthEnd,   'yyyy-MM-dd'),
    }),
  ])

  const rawRooms = (roomsResult.data ?? []) as Array<{
    id: string
    name: string
    room_number: string
    floor: number | null
    sort_order: number
    room_types: {
      id: string
      category: string
      name: string
      sort_order: number
    }
  }>

  const rooms = rawRooms.map(r => ({
    id:               r.id,
    name:             r.name,
    room_number:      r.room_number,
    category:         r.room_types.category as import('@/types/database').RoomTypeCategory,
    type_name:        r.room_types.name,
    type_sort_order:  r.room_types.sort_order,
    room_sort_order:  r.sort_order,
  }))

  const reservations = (reservationsResult.data ?? []) as CalendarReservation[]

  return (
    <div className="flex flex-col h-screen">
      <CalendarGrid
        rooms={rooms}
        initialReservations={reservations}
      />
    </div>
  )
}
