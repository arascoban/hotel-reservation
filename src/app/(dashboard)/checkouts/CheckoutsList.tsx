'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ReservationWithRoom } from '@/types/database'
import ReservationTable from '@/components/Reservations/ReservationTable'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Props {
  initialReservations: ReservationWithRoom[]
}

export default function CheckoutsList({ initialReservations }: Props) {
  const supabase = createClient()
  const [reservations, setReservations] = useState<ReservationWithRoom[]>(initialReservations)
  const [checkingOut, setCheckingOut] = useState<string | null>(null)

  // Quick one-click checkout:
  // 1. Sets reservation status → checked_out
  // 2. Sets room cleaning_status → dirty (Reinigen)
  async function handleQuickCheckout(r: ReservationWithRoom) {
    if (r.status === 'checked_out') return
    setCheckingOut(r.id)

    // Update reservation status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (supabase as any).rpc('update_reservation', {
      p_reservation_id: r.id,
      p_status: 'checked_out',
    })

    if (!rpcError) {
      // Auto-set room to "Reinigen" (dirty) on checkout
      await supabase
        .from('rooms')
        .update({
          cleaning_status: 'dirty',
          cleaning_updated_at: new Date().toISOString(),
        })
        .eq('id', r.room_id)

      // Update local state immediately
      setReservations(prev =>
        prev.map(res =>
          res.id === r.id ? { ...res, status: 'checked_out' as const } : res
        )
      )
    }

    setCheckingOut(null)
  }

  const stillinRoom = reservations.filter(r => r.status === 'checked_in')
  const departed    = reservations.filter(r => r.status === 'checked_out')

  return (
    <>
      {/* Still in room — show quick checkout buttons */}
      {stillinRoom.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Noch im Zimmer ({stillinRoom.length})
          </h2>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th className="px-4 py-3 font-semibold text-slate-600">Zimmer</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Gast</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Personen</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Abreise</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Zahlung</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stillinRoom.map(r => {
                    const isLoading = checkingOut === r.id
                    return (
                      <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-900">
                          Zi. {r.rooms.room_number}
                          <span className="ml-1.5 text-xs font-normal text-slate-400 hidden sm:inline">{r.rooms.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{r.guest_name}</div>
                          {r.guest_phone && <div className="text-xs text-slate-400">{r.guest_phone}</div>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-center">{r.guest_count}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {new Date(r.checkout_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                            r.payment_status === 'paid'         ? 'bg-green-100 text-green-700'  :
                            r.payment_status === 'deposit_paid' ? 'bg-yellow-100 text-yellow-700' :
                                                                  'bg-red-100 text-red-700'
                          )}>
                            {r.payment_status === 'paid' ? 'Bezahlt' : r.payment_status === 'deposit_paid' ? 'Anzahlung' : 'Offen'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleQuickCheckout(r)}
                            disabled={isLoading}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
                              'bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-wait',
                            )}
                          >
                            <LogOut className="w-4 h-4" />
                            {isLoading ? 'Lädt…' : 'Auschecken'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Already checked out */}
      {departed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Bereits ausgecheckt ({departed.length})
          </h2>
          <ReservationTable reservations={departed} />
        </div>
      )}

      {reservations.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-16 text-center">
          <LogOut className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Keine Abreisen für heute.</p>
        </div>
      )}
    </>
  )
}
