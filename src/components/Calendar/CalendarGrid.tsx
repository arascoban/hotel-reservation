'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  addDays, subDays, format, isToday, isSameDay,
  differenceInCalendarDays, parseISO, startOfDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { CalendarReservation, RoomTypeCategory } from '@/types/database'
import { cn } from '@/lib/cn'
import ReservationBlock from './ReservationBlock'
import ReservationDetailModal from '@/components/Reservations/ReservationDetailModal'

// ─── Layout constants ─────────────────────────────────────────────────────────
const DAYS_SHOWN       = 30
const DAY_COL_WIDTH    = 44   // px — width of each day column
const ROW_HEIGHT       = 52   // px — height of each room row
const ROOM_COL_WIDTH   = 196  // px — left column for room names
const HEADER_HEIGHT    = 60   // px

const CATEGORY_LABELS: Record<RoomTypeCategory, string> = {
  single:        'Single Rooms',
  double:        'Double Rooms',
  double_sofa:   'Double Rooms with Sofa Bed',
  family_double: 'Family Rooms (Connecting + Double Bed)',
  family_single: 'Family Rooms (Connecting + Single Bed)',
}

type RoomRow = {
  id: string
  name: string
  room_number: string
  category: RoomTypeCategory
  type_name: string
  type_sort_order: number
  room_sort_order: number
}

interface Props {
  initialReservations: CalendarReservation[]
  rooms: RoomRow[]
}

export default function CalendarGrid({ initialReservations, rooms }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [startDate, setStartDate] = useState<Date>(() => {
    // Start 3 days before today so "today" is visible
    return subDays(startOfDay(new Date()), 3)
  })

  const [reservations, setReservations] = useState<CalendarReservation[]>(initialReservations)
  const [loading, setLoading] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Days to render
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => addDays(startDate, i))
  const endDate = days[days.length - 1]

  // Fetch reservations for the current window
  const fetchReservations = useCallback(async (from: Date, to: Date) => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_calendar_reservations', {
      p_from: format(from, 'yyyy-MM-dd'),
      p_to:   format(to,   'yyyy-MM-dd'),
    })
    if (!error && data) setReservations(data as CalendarReservation[])
    setLoading(false)
  }, [supabase])

  function navigate(delta: number) {
    const newStart = addDays(startDate, delta)
    setStartDate(newStart)
    fetchReservations(newStart, addDays(newStart, DAYS_SHOWN - 1))
  }

  function goToToday() {
    const newStart = subDays(startOfDay(new Date()), 3)
    setStartDate(newStart)
    fetchReservations(newStart, addDays(newStart, DAYS_SHOWN - 1))
  }

  // Handle clicking on an empty day cell → new reservation
  function handleCellClick(roomId: string, day: Date) {
    const checkin = format(day, 'yyyy-MM-dd')
    const checkout = format(addDays(day, 1), 'yyyy-MM-dd')
    router.push(`/reservations/new?room_id=${roomId}&checkin=${checkin}&checkout=${checkout}`)
  }

  // Group rooms by category (in display order)
  const grouped = rooms.reduce<Record<string, RoomRow[]>>((acc, room) => {
    if (!acc[room.category]) acc[room.category] = []
    acc[room.category].push(room)
    return acc
  }, {})

  // Sort categories by type_sort_order
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    const aOrder = grouped[a][0].type_sort_order
    const bOrder = grouped[b][0].type_sort_order
    return aOrder - bOrder
  }) as RoomTypeCategory[]

  // Filter reservations
  const visibleReservations = reservations.filter(r =>
    showCancelled || (r.status !== 'cancelled' && r.status !== 'no_show'),
  )

  // Map reservations by room id for quick lookup
  const resByRoom = visibleReservations.reduce<Record<string, CalendarReservation[]>>((acc, r) => {
    if (!acc[r.room_id]) acc[r.room_id] = []
    acc[r.room_id].push(r)
    return acc
  }, {})

  const selectedReservation = selectedId
    ? reservations.find(r => r.id === selectedId) ?? null
    : null

  const totalWidth = ROOM_COL_WIDTH + DAY_COL_WIDTH * DAYS_SHOWN

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0">
        <h1 className="text-lg font-semibold text-slate-900 mr-2">
          {format(startDate, 'MMMM yyyy')}
          {!isSameDay(startDate, endDate) &&
            format(startDate, 'MM') !== format(endDate, 'MM') &&
            ` – ${format(endDate, 'MMMM yyyy')}`}
        </h1>

        <button onClick={goToToday}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
          Today
        </button>

        <button onClick={() => navigate(-7)}
          className="rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50 transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button onClick={() => navigate(7)}
          className="rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50 transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={e => setShowCancelled(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Show cancelled
          </label>
          {loading && (
            <span className="text-xs text-slate-400 animate-pulse">Loading…</span>
          )}
        </div>
      </div>

      {/* ── Calendar Scroll Container ────────────────────────── */}
      <div className="flex-1 overflow-auto calendar-scroll">
        <div style={{ minWidth: totalWidth }}>

          {/* ── Day header row ─── */}
          <div
            className="sticky top-0 z-20 flex bg-white border-b border-slate-200"
            style={{ height: HEADER_HEIGHT }}
          >
            {/* Room label column */}
            <div
              className="flex-shrink-0 border-r border-slate-200 bg-white"
              style={{ width: ROOM_COL_WIDTH }}
            />

            {/* Day columns */}
            {days.map(day => {
              const todayDay  = isToday(day)
              const isWeekend = [0, 6].includes(day.getDay())
              return (
                <div
                  key={day.toISOString()}
                  style={{ width: DAY_COL_WIDTH, minWidth: DAY_COL_WIDTH }}
                  className={cn(
                    'flex flex-col items-center justify-center border-r border-slate-100 flex-shrink-0',
                    todayDay && 'bg-blue-50',
                    isWeekend && !todayDay && 'bg-slate-50',
                  )}
                >
                  <span className={cn('text-2xs font-medium uppercase tracking-wide',
                    todayDay ? 'text-blue-600' : 'text-slate-400')}>
                    {format(day, 'EEE')}
                  </span>
                  <span className={cn('text-sm font-bold leading-none mt-0.5',
                    todayDay
                      ? 'w-6 h-6 flex items-center justify-center rounded-full bg-blue-600 text-white'
                      : 'text-slate-700')}>
                    {format(day, 'd')}
                  </span>
                </div>
              )
            })}
          </div>

          {/* ── Room rows grouped by category ─── */}
          {sortedCategories.map(category => {
            const categoryRooms = grouped[category].sort(
              (a, b) => a.room_sort_order - b.room_sort_order,
            )
            return (
              <div key={category}>
                {/* Group header */}
                <div
                  className="flex sticky left-0 z-10 bg-slate-100 border-b border-slate-200"
                  style={{ height: 28 }}
                >
                  <div
                    className="flex items-center px-3 flex-shrink-0"
                    style={{ width: ROOM_COL_WIDTH }}
                  >
                    <span className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
                      {CATEGORY_LABELS[category]}
                    </span>
                  </div>
                  {/* Extend the grey bar across all day columns */}
                  <div style={{ width: DAY_COL_WIDTH * DAYS_SHOWN }} />
                </div>

                {/* Room rows */}
                {categoryRooms.map(room => {
                  const roomRes = resByRoom[room.id] ?? []
                  return (
                    <div
                      key={room.id}
                      className="flex border-b border-slate-100 hover:bg-slate-50/50 group"
                      style={{ height: ROW_HEIGHT }}
                    >
                      {/* Room name cell */}
                      <div
                        className="flex flex-col justify-center px-3 border-r border-slate-200 flex-shrink-0 bg-white group-hover:bg-slate-50/50"
                        style={{ width: ROOM_COL_WIDTH }}
                      >
                        <span className="text-sm font-medium text-slate-800 truncate">
                          {room.name}
                        </span>
                        <span className="text-2xs text-slate-400">#{room.room_number}</span>
                      </div>

                      {/* Day cells (clickable empty areas) */}
                      <div
                        className="relative flex-shrink-0"
                        style={{ width: DAY_COL_WIDTH * DAYS_SHOWN, height: ROW_HEIGHT }}
                      >
                        {/* Background day columns (for hover + weekend styling) */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {days.map(day => (
                            <div
                              key={day.toISOString()}
                              style={{ width: DAY_COL_WIDTH }}
                              className={cn(
                                'h-full border-r border-slate-100 flex-shrink-0',
                                isToday(day) && 'bg-blue-50/60',
                                [0, 6].includes(day.getDay()) && !isToday(day) && 'bg-slate-50/60',
                              )}
                            />
                          ))}
                        </div>

                        {/* Clickable empty area for each day */}
                        <div className="absolute inset-0 flex">
                          {days.map(day => {
                            const hasRes = roomRes.some(r => {
                              const ci = parseISO(r.checkin_at)
                              const co = parseISO(r.checkout_at)
                              return day >= startOfDay(ci) && day < startOfDay(co)
                            })
                            return (
                              <div
                                key={day.toISOString()}
                                style={{ width: DAY_COL_WIDTH }}
                                className={cn(
                                  'h-full flex-shrink-0',
                                  !hasRes && 'cursor-pointer',
                                )}
                                onClick={() => !hasRes && handleCellClick(room.id, day)}
                              />
                            )
                          })}
                        </div>

                        {/* Reservation blocks */}
                        {roomRes.map(res => (
                          <ReservationBlock
                            key={res.id}
                            reservation={res}
                            startDate={startDate}
                            daysShown={DAYS_SHOWN}
                            dayWidth={DAY_COL_WIDTH}
                            rowHeight={ROW_HEIGHT}
                            onClick={() => setSelectedId(res.id)}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Detail Modal ──────────────────────────────────────── */}
      {selectedReservation && (
        <ReservationDetailModal
          reservationId={selectedReservation.id}
          onClose={() => setSelectedId(null)}
          onUpdated={() => {
            setSelectedId(null)
            fetchReservations(startDate, endDate)
          }}
        />
      )}
    </div>
  )
}
