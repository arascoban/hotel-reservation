import { parseISO, differenceInCalendarDays, startOfDay } from 'date-fns'
import type { CalendarReservation } from '@/types/database'
import { cn } from '@/lib/cn'

const SOURCE_COLORS: Record<string, string> = {
  booking_com: 'bg-blue-500 hover:bg-blue-600',
  expedia:     'bg-violet-500 hover:bg-violet-600',
  airbnb:      'bg-rose-500 hover:bg-rose-600',
  walk_in:     'bg-green-500 hover:bg-green-600',
  phone:       'bg-amber-500 hover:bg-amber-600',
  website:     'bg-orange-500 hover:bg-orange-600',
  other:       'bg-slate-400 hover:bg-slate-500',
}

const CANCELLED_COLOR = 'bg-slate-200 hover:bg-slate-300 !text-slate-500'

interface Props {
  reservation: CalendarReservation
  startDate: Date       // first visible day on calendar
  daysShown: number
  dayWidth: number
  rowHeight: number
  onClick: () => void
}

export default function ReservationBlock({
  reservation, startDate, daysShown, dayWidth, rowHeight, onClick,
}: Props) {
  const isCancelled = reservation.status === 'cancelled' || reservation.status === 'no_show'

  const checkinDay  = startOfDay(parseISO(reservation.checkin_at))
  const checkoutDay = startOfDay(parseISO(reservation.checkout_at))

  // Offset from the calendar start (can be negative if reservation started before view)
  const blockStart = differenceInCalendarDays(checkinDay,  startDate)
  const blockEnd   = differenceInCalendarDays(checkoutDay, startDate)

  // Clamp to visible range [0, daysShown]
  const clampedStart = Math.max(0, blockStart)
  const clampedEnd   = Math.min(daysShown, blockEnd)

  if (clampedEnd <= clampedStart) return null

  // Determine if block is clipped on left or right
  const clippedLeft  = blockStart < 0
  const clippedRight = blockEnd > daysShown

  const left  = clampedStart * dayWidth
  const width = (clampedEnd - clampedStart) * dayWidth - 2 // 2px gap
  const top   = 6
  const height = rowHeight - 12

  const colorClass = isCancelled
    ? CANCELLED_COLOR
    : (SOURCE_COLORS[reservation.source] ?? SOURCE_COLORS.other)

  return (
    <div
      onClick={onClick}
      title={`${reservation.guest_name} · ${reservation.status}`}
      className={cn(
        'absolute flex items-center px-2 cursor-pointer select-none',
        'text-white text-xs font-medium transition-colors z-10',
        clippedLeft  ? 'rounded-r-md' : 'rounded-l-md',
        clippedRight ? '' : 'rounded-r-md',
        !clippedLeft && !clippedRight && 'rounded-md',
        colorClass,
      )}
      style={{ left, width, top, height }}
    >
      {/* Left clip indicator */}
      {clippedLeft && (
        <span className="mr-1 opacity-70">◄</span>
      )}

      <span className="truncate">{reservation.guest_name}</span>

      {/* Right clip indicator */}
      {clippedRight && (
        <span className="ml-1 opacity-70">►</span>
      )}
    </div>
  )
}
