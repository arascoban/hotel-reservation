import { parseISO, differenceInCalendarDays, startOfDay } from 'date-fns'
import type { CalendarReservation } from '@/types/database'
import { cn } from '@/lib/cn'

// Source color palette — bg + hover + text
const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  booking_com: { bg: 'bg-blue-500 hover:bg-blue-600',    text: 'text-white' },
  expedia:     { bg: 'bg-violet-500 hover:bg-violet-600', text: 'text-white' },
  airbnb:      { bg: 'bg-rose-500 hover:bg-rose-600',    text: 'text-white' },
  walk_in:     { bg: 'bg-emerald-500 hover:bg-emerald-600', text: 'text-white' },
  phone:       { bg: 'bg-amber-500 hover:bg-amber-600',  text: 'text-white' },
  website:     { bg: 'bg-orange-500 hover:bg-orange-600', text: 'text-white' },
  other:       { bg: 'bg-slate-400 hover:bg-slate-500',  text: 'text-white' },
}

const CANCELLED_COLORS = { bg: 'bg-slate-200 hover:bg-slate-300', text: 'text-slate-500' }

interface Props {
  reservation: CalendarReservation
  startDate: Date      // first visible day (= first day of current month)
  daysShown: number    // total days shown (= days in month)
  dayWidth: number
  rowHeight: number
  onClick: () => void
}

export default function ReservationBlock({
  reservation, startDate, daysShown, dayWidth, rowHeight, onClick,
}: Props) {
  const isCancelled = reservation.status === 'cancelled' || reservation.status === 'no_show'
  const isDeleted   = !!reservation.deleted_at

  const checkinDay  = startOfDay(parseISO(reservation.checkin_at))
  const checkoutDay = startOfDay(parseISO(reservation.checkout_at))

  // Days offset from calendar start (can be negative = started before view)
  const blockStart = differenceInCalendarDays(checkinDay,  startDate)
  const blockEnd   = differenceInCalendarDays(checkoutDay, startDate)

  // Clamp to visible range
  const clampedStart = Math.max(0, blockStart)
  const clampedEnd   = Math.min(daysShown, blockEnd)

  if (clampedEnd <= clampedStart) return null

  const clippedLeft  = blockStart < 0
  const clippedRight = blockEnd > daysShown

  const left       = clampedStart * dayWidth
  const blockWidth = (clampedEnd - clampedStart) * dayWidth - 2  // 2px gap between blocks
  const top        = 7
  const height     = rowHeight - 14  // vertical padding

  const colors = (isCancelled || isDeleted) ? CANCELLED_COLORS : (SOURCE_COLORS[reservation.source] ?? SOURCE_COLORS.other)

  // Rounding: only round corners where the block starts/ends naturally
  const roundingClass = cn(
    !clippedLeft  && !clippedRight && 'rounded-lg',
    clippedLeft   && !clippedRight && 'rounded-r-lg',
    !clippedLeft  &&  clippedRight && 'rounded-l-lg',
    clippedLeft   &&  clippedRight && 'rounded-none',
  )

  // Only show text if block is wide enough
  const showText = blockWidth >= 28

  const tooltipText = [
    reservation.guest_name,
    `${reservation.checkin_at.slice(0, 10)} → ${reservation.checkout_at.slice(0, 10)}`,
    reservation.status,
  ].join(' · ')

  return (
    <div
      onClick={onClick}
      title={tooltipText}
      className={cn(
        'absolute flex items-center cursor-pointer select-none z-10',
        'transition-all duration-100 shadow-sm hover:shadow-md hover:z-20',
        'px-2 gap-1 overflow-hidden',
        colors.bg,
        colors.text,
        roundingClass,
        isDeleted && 'opacity-40 border-2 border-dashed border-red-400',
      )}
      style={{ left, width: blockWidth, top, height }}
    >
      {/* Left overflow indicator */}
      {clippedLeft && showText && (
        <span className="opacity-60 flex-shrink-0 text-2xs">◀</span>
      )}

      {/* Guest name */}
      {showText && (
        <span className="text-xs font-semibold truncate flex-1 leading-none">
          {reservation.guest_name}
        </span>
      )}

      {/* Right overflow indicator */}
      {clippedRight && showText && (
        <span className="opacity-60 flex-shrink-0 text-2xs">▶</span>
      )}

      {/* For very narrow blocks, just show a colored bar */}
      {!showText && (
        <div className="w-full h-full" />
      )}
    </div>
  )
}
