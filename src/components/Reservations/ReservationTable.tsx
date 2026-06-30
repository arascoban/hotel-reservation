'use client'

import { useState } from 'react'
import type { ReservationWithRoom, ReservationStatus, PaymentStatus } from '@/types/database'
import { getSourceLabel, getSourceColor, formatDate } from '@/lib/reservations'
import { cn } from '@/lib/cn'
import ReservationDetailModal from './ReservationDetailModal'
import { useAdmin } from '@/hooks/useAdmin'

const STATUS_STYLES: Record<ReservationStatus, string> = {
  confirmed:   'bg-blue-100 text-blue-800',
  checked_in:  'bg-green-100 text-green-800',
  checked_out: 'bg-slate-100 text-slate-600',
  cancelled:   'bg-red-100 text-red-700',
  no_show:     'bg-orange-100 text-orange-700',
}

const STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed:   'Bestätigt',
  checked_in:  'Eingecheckt',
  checked_out: 'Ausgecheckt',
  cancelled:   'Storniert',
  no_show:     'Nicht erschienen',
}

const PAY_STYLES: Record<PaymentStatus, string> = {
  paid:         'bg-green-100 text-green-800',
  deposit_paid: 'bg-yellow-100 text-yellow-800',
  unpaid:       'bg-red-100 text-red-700',
  refunded:     'bg-slate-100 text-slate-600',
}

const PAY_LABELS: Record<PaymentStatus, string> = {
  paid:         'Bezahlt',
  deposit_paid: 'Anzahlung',
  unpaid:       'Unbezahlt',
  refunded:     'Erstattet',
}

interface Props {
  reservations: ReservationWithRoom[]
  onRefresh?: () => void
}

export default function ReservationTable({ reservations, onRefresh }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { isAdmin }                 = useAdmin()

  if (reservations.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
        <p className="text-slate-500">Keine Reservierungen gefunden.</p>
      </div>
    )
  }

  return (
    <>
      {/* ── Mobile card list (< sm) ─────────────────────────────── */}
      <div className="sm:hidden space-y-2">
        {reservations.map(r => {
          const isDeleted = !!r.deleted_at
          return (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={cn(
                'w-full text-left rounded-xl border bg-white p-3.5 transition-colors active:bg-slate-50',
                isDeleted && isAdmin ? 'border-red-200 bg-red-50/60 opacity-80' : 'border-slate-200',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('font-semibold text-slate-900 truncate', isDeleted && 'line-through text-slate-400')}>
                      {r.guest_name}
                    </span>
                    {isDeleted && isAdmin && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-2xs font-semibold text-red-700 flex-shrink-0">
                        Gelöscht
                      </span>
                    )}
                  </div>
                  {r.guest_phone && <div className="text-xs text-slate-400 mt-0.5">{r.guest_phone}</div>}
                </div>
                <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0', STATUS_STYLES[r.status])}>
                  {STATUS_LABELS[r.status]}
                </span>
              </div>

              <div className="mt-2 text-sm text-slate-700">
                {r.rooms.name} <span className="text-slate-400">#{r.rooms.room_number}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {formatDate(r.checkin_at)} → {formatDate(r.checkout_at)} · {r.guest_count} Pers.
              </div>

              <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                <span className="flex items-center gap-1 text-slate-600">
                  <span className={cn('w-2 h-2 rounded-full', getSourceColor(r.source))} />
                  {getSourceLabel(r.source)}
                </span>
                <span className={cn('inline-flex rounded-full px-2 py-0.5 font-medium', PAY_STYLES[r.payment_status])}>
                  {PAY_LABELS[r.payment_status]}
                </span>
                {r.total_price != null && (
                  <span className="ml-auto font-semibold text-slate-900">€{r.total_price.toFixed(2)}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Desktop table (sm+) ─────────────────────────────────── */}
      <div className="hidden sm:block rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Gast</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Zimmer</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Anreise</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Abreise</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Personen</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Quelle</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Status</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Zahlung</th>
                <th className="px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">Gesamt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reservations.map(r => {
                const isDeleted = !!r.deleted_at
                return (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    'cursor-pointer transition-colors',
                    isDeleted && isAdmin
                      ? 'bg-red-50/60 hover:bg-red-50 opacity-70'
                      : 'hover:bg-slate-50',
                  )}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={cn('font-medium text-slate-900', isDeleted && 'line-through text-slate-400')}>
                        {r.guest_name}
                      </span>
                      {isDeleted && isAdmin && (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-2xs font-semibold text-red-700 whitespace-nowrap">
                          Gelöscht
                        </span>
                      )}
                    </div>
                    {r.guest_phone && (
                      <div className="text-xs text-slate-400 mt-0.5">{r.guest_phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {r.rooms.name}
                    <span className="ml-1 text-slate-400">#{r.rooms.room_number}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {formatDate(r.checkin_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {formatDate(r.checkout_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-700 text-center">{r.guest_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className={cn('w-2 h-2 rounded-full flex-shrink-0',
                        getSourceColor(r.source))} />
                      <span className="text-slate-700 whitespace-nowrap">{getSourceLabel(r.source)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                      STATUS_STYLES[r.status])}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                      PAY_STYLES[r.payment_status])}>
                      {PAY_LABELS[r.payment_status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {r.total_price != null ? `€${r.total_price.toFixed(2)}` : '—'}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && (
        <ReservationDetailModal
          reservationId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={() => {
            setSelectedId(null)
            onRefresh?.()
          }}
        />
      )}
    </>
  )
}
