'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  addDays, addMonths, subMonths, format, isToday,
  parseISO, startOfDay, startOfMonth, endOfMonth, getDaysInMonth,
} from 'date-fns'
import { de } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { CalendarReservation, RoomTypeCategory } from '@/types/database'
import { cn } from '@/lib/cn'
import ReservationBlock from './ReservationBlock'
import ReservationDetailModal from '@/components/Reservations/ReservationDetailModal'
import { useAdmin } from '@/hooks/useAdmin'

// ─── Layout constants ─────────────────────────────────────────────────────────
const ROOM_COL_WIDTH = 148   // px — sticky room name column
const MIN_DAY_WIDTH  = 26    // px — minimum day column (enables horizontal scroll on mobile)
const ROW_HEIGHT     = 62    // px — taller rows so guest names are clearly readable
const HEADER_HEIGHT  = 68    // px

// Rooms belonging to the Pension building
const PENSION_ROOMS = ['04', '05']

const CATEGORY_LABELS: Record<RoomTypeCategory, string> = {
  single:        'Einzelzimmer',
  double:        'Doppelzimmer',
  double_sofa:   'Doppelzimmer mit Schlafsofa',
  family_double: 'Familienzimmer (Doppel)',
  family_single: 'Familienzimmer (Einzel)',
}

type RoomRow = {
  id: string
  name: string
  room_number: string
  category: RoomTypeCategory
  type_name: string
  type_sort_order: number
  room_sort_order: number
  cleaning_status?: 'clean' | 'dirty' | 'maintenance'
}

interface Props {
  initialReservations: CalendarReservation[]
  rooms: RoomRow[]
}

export default function CalendarGrid({ initialReservations, rooms }: Props) {
  const router    = useRouter()
  const supabase  = createClient()
  const { isAdmin } = useAdmin()

  // ── State ────────────────────────────────────────────────────
  const [currentMonth,   setCurrentMonth]   = useState<Date>(() => startOfMonth(new Date()))
  const [reservations,   setReservations]   = useState<CalendarReservation[]>(initialReservations)
  const [loading,        setLoading]        = useState(false)
  const [showCancelled,  setShowCancelled]  = useState(false)
  const [showDeleted,    setShowDeleted]    = useState(false)
  const [selectedId,     setSelectedId]     = useState<string | null>(null)

  // ── Dynamic column width via ResizeObserver ──────────────────
  const scrollRef      = useRef<HTMLDivElement>(null)
  const [containerW,   setContainerW]       = useState(1100)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setContainerW(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Month data ───────────────────────────────────────────────
  const daysInMonth = getDaysInMonth(currentMonth)
  const days        = Array.from({ length: daysInMonth }, (_, i) => addDays(currentMonth, i))

  // Fill available width exactly; never go below MIN_DAY_WIDTH
  const dayWidth   = Math.max(MIN_DAY_WIDTH, (containerW - ROOM_COL_WIDTH) / daysInMonth)
  const totalWidth = ROOM_COL_WIDTH + dayWidth * daysInMonth

  // Show abbreviated day name only if column is wide enough
  const showDayName = dayWidth >= 32

  // ── Data fetching ────────────────────────────────────────────
  const fetchReservations = useCallback(async (month: Date) => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_calendar_reservations', {
      p_from: format(startOfMonth(month), 'yyyy-MM-dd'),
      p_to:   format(endOfMonth(month),   'yyyy-MM-dd'),
    })
    if (!error && data) setReservations(data as CalendarReservation[])
    setLoading(false)
  }, [supabase])

  function prevMonth() {
    const m = subMonths(currentMonth, 1)
    setCurrentMonth(m)
    fetchReservations(m)
  }

  function nextMonth() {
    const m = addMonths(currentMonth, 1)
    setCurrentMonth(m)
    fetchReservations(m)
  }

  function goToToday() {
    const m = startOfMonth(new Date())
    setCurrentMonth(m)
    fetchReservations(m)
  }

  // Click on empty cell → create reservation
  function handleCellClick(roomId: string, day: Date) {
    const checkin  = format(day, 'yyyy-MM-dd')
    const checkout = format(addDays(day, 1), 'yyyy-MM-dd')
    router.push(`/reservations/new?room_id=${roomId}&checkin=${checkin}&checkout=${checkout}`)
  }

  // ── Room grouping ────────────────────────────────────────────
  const grouped = rooms.reduce<Record<string, RoomRow[]>>((acc, room) => {
    if (!acc[room.category]) acc[room.category] = []
    acc[room.category].push(room)
    return acc
  }, {})

  const sortedCategories = (Object.keys(grouped) as RoomTypeCategory[]).sort(
    (a, b) => grouped[a][0].type_sort_order - grouped[b][0].type_sort_order,
  )

  // ── Reservation filtering ────────────────────────────────────
  const visible = reservations.filter(r => {
    // Non-admins never see soft-deleted reservations
    if (!isAdmin && r.deleted_at) return false
    // Admins can toggle deleted visibility
    if (isAdmin && r.deleted_at && !showDeleted) return false
    // Cancelled / no-show toggle
    if (!showCancelled && (r.status === 'cancelled' || r.status === 'no_show')) return false
    return true
  })

  const resByRoom = visible.reduce<Record<string, CalendarReservation[]>>((acc, r) => {
    if (!acc[r.room_id]) acc[r.room_id] = []
    acc[r.room_id].push(r)
    return acc
  }, {})

  const selectedRes = selectedId ? reservations.find(r => r.id === selectedId) ?? null : null

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 bg-white border-b-2 border-slate-300 flex-shrink-0 shadow-sm">

        {/* Month navigation */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={prevMonth}
            className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-all active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <h2 className="text-base font-bold text-slate-900 w-40 text-center select-none">
            {format(currentMonth, 'MMMM yyyy', { locale: de })}
          </h2>

          <button
            onClick={nextMonth}
            className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-all active:scale-95"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={goToToday}
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-all"
        >
          Heute
        </button>

        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={e => setShowCancelled(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="hidden sm:inline">Stornierte</span>
          </label>

          {isAdmin && (
            <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={e => setShowDeleted(e.target.checked)}
                className="rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <span className="hidden sm:inline text-red-500">Gelöschte</span>
            </label>
          )}

          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-blue-500 animate-pulse">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Lädt…
            </div>
          )}
        </div>
      </div>

      {/* ── Scrollable calendar ─────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{ minWidth: totalWidth }}>

          {/* ── Day header ─── */}
          <div
            className="sticky top-0 z-20 flex bg-white border-b-2 border-slate-300"
            style={{ height: HEADER_HEIGHT }}
          >
            {/* Room column header */}
            <div
              className="sticky left-0 z-30 flex-shrink-0 bg-white border-r-2 border-slate-300 flex items-end px-3 pb-2.5"
              style={{ width: ROOM_COL_WIDTH }}
            >
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Zimmer</span>
            </div>

            {/* Day columns */}
            {days.map(day => {
              const todayDay  = isToday(day)
              const isWeekend = [0, 6].includes(day.getDay())
              return (
                <div
                  key={day.toISOString()}
                  style={{ width: dayWidth, minWidth: dayWidth }}
                  className={cn(
                    'flex flex-col items-center justify-end pb-2.5 border-r border-slate-200 flex-shrink-0 transition-colors',
                    todayDay  && 'bg-blue-50',
                    isWeekend && !todayDay && 'bg-slate-50',
                  )}
                >
                  {showDayName && (
                    <span className={cn(
                      'text-2xs font-semibold uppercase tracking-wide leading-none mb-1',
                      todayDay ? 'text-blue-500' : 'text-slate-400',
                    )}>
                      {format(day, 'EEEEE', { locale: de })}
                    </span>
                  )}
                  <span className={cn(
                    'text-xs font-bold leading-none',
                    todayDay
                      ? 'w-6 h-6 flex items-center justify-center rounded-full bg-blue-600 text-white text-xs'
                      : isWeekend ? 'text-slate-500' : 'text-slate-700',
                  )}>
                    {format(day, 'd')}
                  </span>
                </div>
              )
            })}
          </div>

          {/* ── Room rows grouped by category ─── */}
          {sortedCategories.map(category => {
            const catRooms = grouped[category].sort((a, b) => a.room_sort_order - b.room_sort_order)

            return (
              <div key={category}>

                {/* Category group header */}
                <div
                  className="flex border-b border-slate-300 bg-slate-100"
                  style={{ height: 28 }}
                >
                  <div
                    className="sticky left-0 z-10 flex items-center px-3 flex-shrink-0 bg-slate-100 border-r-2 border-slate-300"
                    style={{ width: ROOM_COL_WIDTH }}
                  >
                    <span className="text-2xs font-bold uppercase tracking-widest text-slate-500">
                      {CATEGORY_LABELS[category]}
                    </span>
                  </div>
                  <div style={{ width: dayWidth * daysInMonth }} />
                </div>

                {/* Room rows */}
                {catRooms.map((room, idx) => {
                  const roomRes   = resByRoom[room.id] ?? []
                  const isPension = PENSION_ROOMS.includes(room.room_number)
                  const isEvenRow = idx % 2 === 0
                  const cs        = room.cleaning_status ?? 'clean'

                  // Row background based on cleaning status
                  const rowBg = cs === 'maintenance'
                    ? 'bg-red-50'
                    : cs === 'dirty'
                      ? 'bg-amber-50'
                      : isEvenRow ? 'bg-white' : 'bg-slate-50/60'

                  // Sticky name cell background (must match row)
                  const nameBg = cs === 'maintenance'
                    ? 'bg-red-50 group-hover:bg-red-100/60'
                    : cs === 'dirty'
                      ? 'bg-amber-50 group-hover:bg-amber-100/60'
                      : cn(isEvenRow ? 'bg-white' : 'bg-slate-50/60', 'group-hover:bg-blue-50/40')

                  return (
                    <div
                      key={room.id}
                      className={cn('flex border-b border-slate-200 group', rowBg)}
                      style={{ height: ROW_HEIGHT }}
                    >
                      {/* Sticky room name */}
                      <div
                        className={cn(
                          'sticky left-0 z-10 flex-shrink-0 flex flex-col justify-center px-3',
                          'border-r-2 border-slate-300 transition-colors',
                          nameBg,
                        )}
                        style={{ width: ROOM_COL_WIDTH }}
                      >
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-slate-800">
                            Zi. {room.room_number}
                          </span>
                          {isPension && (
                            <span className="text-2xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1 py-0.5 leading-none">
                              Pension
                            </span>
                          )}
                          {cs === 'maintenance' && (
                            <span className="text-2xs font-semibold text-red-700 bg-red-100 border border-red-200 rounded px-1 py-0.5 leading-none">
                              Wartung
                            </span>
                          )}
                          {cs === 'dirty' && (
                            <span className="text-2xs font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded px-1 py-0.5 leading-none">
                              Reinigen
                            </span>
                          )}
                        </div>
                        <span className="text-2xs text-slate-400 mt-0.5 truncate">{room.type_name}</span>
                      </div>

                      {/* Day grid area */}
                      <div
                        className="relative flex-shrink-0"
                        style={{ width: dayWidth * daysInMonth, height: ROW_HEIGHT }}
                      >
                        {/* Background stripes (weekend + today + cleaning status overlay) */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {days.map(day => (
                            <div
                              key={day.toISOString()}
                              style={{ width: dayWidth }}
                              className={cn(
                                'h-full border-r border-slate-200 flex-shrink-0',
                                cs === 'maintenance' && 'bg-red-100/40',
                                cs === 'dirty'       && 'bg-amber-100/40',
                                isToday(day)         && 'bg-blue-50/70',
                                [0, 6].includes(day.getDay()) && !isToday(day) && cs === 'clean' && 'bg-slate-100/60',
                              )}
                            />
                          ))}
                        </div>

                        {/* Clickable empty cells */}
                        <div className="absolute inset-0 flex">
                          {days.map(day => {
                            const occupied = roomRes.some(r => {
                              const ci = parseISO(r.checkin_at)
                              const co = parseISO(r.checkout_at)
                              return day >= startOfDay(ci) && day < startOfDay(co)
                            })
                            // Maintenance rooms: show red cursor (can still click but form will block)
                            return (
                              <div
                                key={day.toISOString()}
                                style={{ width: dayWidth }}
                                className={cn(
                                  'h-full flex-shrink-0',
                                  !occupied && cs === 'maintenance' && 'cursor-not-allowed',
                                  !occupied && cs !== 'maintenance' && 'cursor-pointer hover:bg-blue-100/50 transition-colors',
                                )}
                                onClick={() => !occupied && cs !== 'maintenance' && handleCellClick(room.id, day)}
                              />
                            )
                          })}
                        </div>

                        {/* Reservation blocks */}
                        {roomRes.map(res => (
                          <ReservationBlock
                            key={res.id}
                            reservation={res}
                            startDate={currentMonth}
                            daysShown={daysInMonth}
                            dayWidth={dayWidth}
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

          {/* Bottom padding */}
          <div className="h-6" />
        </div>
      </div>

      {/* ── Detail modal ─────────────────────────────────────── */}
      {selectedRes && (
        <ReservationDetailModal
          reservationId={selectedRes.id}
          onClose={() => setSelectedId(null)}
          onUpdated={() => {
            setSelectedId(null)
            fetchReservations(currentMonth)
          }}
        />
      )}
    </div>
  )
}
