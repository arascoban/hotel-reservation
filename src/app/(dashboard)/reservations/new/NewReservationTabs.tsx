'use client'

import { useState } from 'react'
import { cn } from '@/lib/cn'
import { User, Users } from 'lucide-react'
import ReservationForm from '@/components/Reservations/ReservationForm'
import GroupReservationForm from '@/components/Reservations/GroupReservationForm'

interface Props {
  defaultRoomId?:  string
  defaultCheckin?: string
  defaultCheckout?: string
}

/**
 * Single vs group booking.
 *
 * A group is one customer over several rooms: it produces one reservation row
 * per room (so the calendar blocks each of them) linked by a shared group id,
 * and is billed with a single confirmation and invoice.
 */
export default function NewReservationTabs({
  defaultRoomId, defaultCheckin, defaultCheckout,
}: Props) {
  // Coming from a calendar cell means a specific room — that's a single booking.
  const [mode, setMode] = useState<'single' | 'group'>('single')

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
        <button
          onClick={() => setMode('single')}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg h-11 text-sm font-medium transition-colors',
            mode === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}>
          <User className="w-4 h-4" />
          Einzelbuchung
        </button>
        <button
          onClick={() => setMode('group')}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg h-11 text-sm font-medium transition-colors',
            mode === 'group' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
          )}>
          <Users className="w-4 h-4" />
          Gruppenbuchung
        </button>
      </div>

      {mode === 'single' ? (
        <ReservationForm
          defaultRoomId={defaultRoomId}
          defaultCheckin={defaultCheckin}
          defaultCheckout={defaultCheckout}
        />
      ) : (
        <GroupReservationForm />
      )}
    </>
  )
}
