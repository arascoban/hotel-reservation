'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'
import { formatDate, getSourceLabel, getSourceColor } from '@/lib/reservations'
import { eur } from '@/lib/deposit'
import ReservationDetailModal from '@/components/Reservations/ReservationDetailModal'
import GroupEditModal from '@/components/Reservations/GroupEditModal'
import DateInput from '@/components/ui/DateInput'
import {
  CalendarRange, Loader2, Users, Layers, ChevronRight, Search, Mail, Pencil,
} from 'lucide-react'
import type { ReservationStatus, PaymentStatus } from '@/types/database'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Row {
  id: string
  guest_name: string
  guest_email: string | null
  checkin_at: string
  checkout_at: string
  guest_count: number
  child_count: number | null
  total_price: number | null
  status: ReservationStatus
  payment_status: PaymentStatus
  source: string
  group_booking_id: string | null
  family_booking_id: string | null
  deleted_at: string | null
  rooms: { room_number: string; name: string; room_types?: { name: string } } | null
}

/**
 * One real booking. A group or family booking occupies several rooms — and
 * therefore several reservation rows — but is a single booking to the guest,
 * gets one confirmation and one invoice.
 */
interface Booking {
  key:        string
  kind:       'single' | 'family' | 'group'
  primary:    Row          // the row actions operate on
  rows:       Row[]
  checkin:    string
  checkout:   string
  guests:     number
  children:   number
  total:      number | null
}

const STATUS_STYLES: Record<ReservationStatus, string> = {
  confirmed:   'bg-blue-100 text-blue-800',
  checked_in:  'bg-green-100 text-green-800',
  checked_out: 'bg-slate-100 text-slate-600',
  cancelled:   'bg-red-100 text-red-700',
  no_show:     'bg-orange-100 text-orange-700',
}
const STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed: 'Bestätigt', checked_in: 'Eingecheckt', checked_out: 'Ausgecheckt',
  cancelled: 'Storniert', no_show: 'Nicht erschienen',
}
const PAY_STYLES: Record<PaymentStatus, string> = {
  paid: 'bg-green-100 text-green-800', deposit_paid: 'bg-yellow-100 text-yellow-800',
  unpaid: 'bg-red-100 text-red-700', refunded: 'bg-slate-100 text-slate-600',
}
const PAY_LABELS: Record<PaymentStatus, string> = {
  paid: 'Bezahlt', deposit_paid: 'Anzahlung', unpaid: 'Unbezahlt', refunded: 'Erstattet',
}

function iso(d: Date) { return d.toISOString().slice(0, 10) }

/** Collapse reservation rows into the bookings they actually belong to. */
function groupIntoBookings(rows: Row[]): Booking[] {
  const byKey = new Map<string, Row[]>()
  for (const r of rows) {
    const key = r.group_booking_id ?? r.family_booking_id ?? r.id
    const list = byKey.get(key)
    if (list) list.push(r); else byKey.set(key, [r])
  }

  return [...byKey.entries()].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => a.checkin_at.localeCompare(b.checkin_at))
    const primary = sorted[0]
    const kind: Booking['kind'] =
      primary.group_booking_id  ? 'group'
      : primary.family_booking_id ? 'family'
      : 'single'

    return {
      key,
      kind,
      primary,
      rows: sorted,
      // A group may span slightly different dates per room
      checkin:  sorted.reduce((min, r) => r.checkin_at  < min ? r.checkin_at  : min, sorted[0].checkin_at),
      checkout: sorted.reduce((max, r) => r.checkout_at > max ? r.checkout_at : max, sorted[0].checkout_at),
      guests:   sorted.reduce((s, r) => s + (r.guest_count ?? 0), 0),
      children: sorted.reduce((s, r) => s + (r.child_count ?? 0), 0),
      // A family booking duplicates the price across both rows — count it once
      total: kind === 'family'
        ? (primary.total_price ?? null)
        : sorted.reduce<number | null>((s, r) =>
            r.total_price == null ? s : (s ?? 0) + r.total_price, null),
    }
  }).sort((a, b) => a.checkin.localeCompare(b.checkin))
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReservationsBrowser() {
  const supabase = createClient()

  const today = new Date()
  const inAMonth = new Date(); inAMonth.setMonth(inAMonth.getMonth() + 1)

  // Default: everything still running or yet to come. Date filtering is
  // opt-in, so opening the page always shows the bookings that matter now.
  const [mode,    setMode]    = useState<'upcoming' | 'range' | 'all'>('upcoming')
  const [from,    setFrom]    = useState(iso(today))
  const [to,      setTo]      = useState(iso(inAMonth))
  const [query,   setQuery]   = useState('')
  const [rows,    setRows]    = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [openId,  setOpenId]  = useState<string | null>(null)
  const [editGroupId, setEditGroupId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const cols = 'id, guest_name, guest_email, checkin_at, checkout_at, guest_count, child_count, total_price, status, payment_status, source, group_booking_id, family_booking_id, deleted_at, rooms(room_number, name, room_types(name))'

    let q = supabase.from('reservations').select(cols).is('deleted_at', null)

    if (mode === 'upcoming') {
      // Still running or in the future — anything not yet departed.
      q = q.gte('checkout_at', `${iso(new Date())}T00:00:00`)
    } else if (mode === 'range') {
      // Overlapping the window: starts before it ends, ends after it starts.
      q = q.lt('checkin_at', `${to}T23:59:59`).gt('checkout_at', `${from}T00:00:00`)
    }

    const { data } = await q.order('checkin_at')
    setRows((data ?? []) as unknown as Row[])
    setLoading(false)
  }, [supabase, mode, from, to])

  useEffect(() => { load() }, [load])

  const bookings = groupIntoBookings(rows).filter(b =>
    !query.trim() || b.primary.guest_name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const roomCount = rows.length

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-8 w-full">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
          <CalendarRange className="w-5 h-5 sm:w-6 sm:h-6 text-slate-500 flex-shrink-0" />
          Reservierungen
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {loading ? 'Lädt…' : (
            <>
              {bookings.length} Buchung{bookings.length !== 1 ? 'en' : ''}
              {roomCount !== bookings.length && ` · ${roomCount} Zimmer`}
              {mode === 'upcoming' ? ' — aktuell & künftig'
               : mode === 'range'  ? ' im gewählten Zeitraum'
               : ' insgesamt'}
            </>
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
          {([
            ['upcoming', 'Aktuell & künftig'],
            ['range',    'Zeitraum'],
            ['all',      'Alle'],
          ] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              className={cn(
                'rounded-lg h-10 text-xs sm:text-sm font-medium transition-colors',
                mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              )}>
              {label}
            </button>
          ))}
        </div>

        {mode === 'range' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Von</label>
              <DateInput value={from} onChange={setFrom} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Bis</label>
              <DateInput value={to} onChange={setTo} min={from} />
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Gast suchen</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Name…"
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 h-11 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Lädt…
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center">
          <CalendarRange className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Keine Reservierungen in diesem Zeitraum.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {bookings.map(b => (
            <div key={b.key}
              className="rounded-2xl border border-slate-200 bg-white overflow-hidden">

              <button onClick={() => setOpenId(b.primary.id)}
                className="w-full text-left p-4 hover:bg-blue-50/30 active:bg-slate-50 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 truncate">{b.primary.guest_name}</span>

                    {b.kind === 'group' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-2xs font-semibold">
                        <Layers className="w-3 h-3" /> Gruppe · {b.rows.length} Zimmer
                      </span>
                    )}
                    {b.kind === 'family' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-2xs font-semibold">
                        👨‍👩‍👧 Familienzimmer
                      </span>
                    )}
                    <span className={cn('rounded-full px-2 py-0.5 text-2xs font-medium', STATUS_STYLES[b.primary.status])}>
                      {STATUS_LABELS[b.primary.status]}
                    </span>
                  </div>

                  <p className="text-sm text-slate-600 mt-1">
                    {formatDate(b.checkin)} → {formatDate(b.checkout)}
                  </p>

                  {/* Every room of this booking */}
                  <p className="text-xs text-slate-400 mt-1">
                    {b.rows.map(r => `Zi. ${r.rooms?.room_number ?? '?'}`).join(' · ')}
                  </p>

                  <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
                    <span className="flex items-center gap-1 text-slate-500">
                      <Users className="w-3.5 h-3.5" />
                      {b.guests - b.children} Erw.
                      {b.children > 0 && ` + ${b.children} Kind${b.children !== 1 ? 'er' : ''}`}
                    </span>
                    <span className="flex items-center gap-1 text-slate-500">
                      <span className={cn('w-2 h-2 rounded-full', getSourceColor(b.primary.source as any))} />
                      {getSourceLabel(b.primary.source as any)}
                    </span>
                    <span className={cn('rounded-full px-2 py-0.5 font-medium', PAY_STYLES[b.primary.payment_status])}>
                      {PAY_LABELS[b.primary.payment_status]}
                    </span>
                    {b.primary.guest_email && (
                      <span className="inline-flex items-center gap-1 text-slate-400" title={b.primary.guest_email}>
                        <Mail className="w-3.5 h-3.5" /> E-Mail hinterlegt
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                  {b.total != null && (
                    <span className="font-bold text-lg text-slate-900">{eur(b.total)}</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </div>
              </button>

              {/* A group is edited as a whole: rooms, dates, prices at once */}
              {b.kind === 'group' && b.primary.group_booking_id && (
                <div className="border-t border-slate-100">
                  <button
                    onClick={() => setEditGroupId(b.primary.group_booking_id)}
                    className="w-full inline-flex items-center justify-center gap-1.5 h-11 text-xs font-medium text-purple-700 hover:bg-purple-50 active:bg-purple-100 transition-colors">
                    <Pencil className="w-3.5 h-3.5" /> Gruppenbuchung bearbeiten
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {openId && (
        <ReservationDetailModal
          reservationId={openId}
          onClose={() => setOpenId(null)}
          onUpdated={() => { setOpenId(null); load() }}
        />
      )}

      {editGroupId && (
        <GroupEditModal
          groupId={editGroupId}
          onClose={() => setEditGroupId(null)}
          onUpdated={() => { setEditGroupId(null); load() }}
        />
      )}
    </div>
  )
}
