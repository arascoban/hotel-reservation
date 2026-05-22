'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import type { RoomCleaningStatus } from '@/types/database'
import { getRoomFloor } from '@/lib/reservations'
import { cn } from '@/lib/cn'

interface RoomWithStatus {
  id: string
  room_number: string
  name: string
  cleaning_status: RoomCleaningStatus
  cleaning_note: string | null
  cleaning_updated_at: string
  // current occupancy
  guest_name?: string
  checkin_at?: string
  checkout_at?: string
  occupied: boolean      // currently checked in
  upcoming: boolean      // arriving within next 14 days
}

const STATUS_CONFIG: Record<RoomCleaningStatus, { label: string; bg: string; dot: string; badge: string }> = {
  clean:       { label: 'Sauber',      bg: 'bg-green-50 border-green-200',  dot: 'bg-green-500',  badge: 'bg-green-100 text-green-800' },
  dirty:       { label: 'Reinigen',    bg: 'bg-amber-50 border-amber-200',  dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-800' },
  maintenance: { label: 'Wartung',     bg: 'bg-red-50 border-red-200',      dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700'   },
}

const NEXT_STATUS: Record<RoomCleaningStatus, RoomCleaningStatus> = {
  clean: 'dirty', dirty: 'maintenance', maintenance: 'clean',
}

export default function RoomsPage() {
  const supabase = createClient()
  const [rooms,   setRooms]   = useState<RoomWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const now    = new Date()
    const today  = format(now, 'yyyy-MM-dd')
    const in14   = format(new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')

    const [{ data: roomData }, { data: resData }] = await Promise.all([
      supabase.from('rooms')
        .select('id, room_number, name, cleaning_status, cleaning_note, cleaning_updated_at')
        .eq('is_active', true)
        .order('sort_order'),
      // Fetch current + upcoming (next 14 days) reservations
      supabase.from('reservations')
        .select('room_id, guest_name, checkin_at, checkout_at')
        .not('status', 'in', '("cancelled","no_show","checked_out")')
        .is('deleted_at', null)
        .lte('checkin_at', `${in14}T23:59:59`)
        .gte('checkout_at', `${today}T00:00:01`)
        .order('checkin_at'),
    ])

    // For each room keep the EARLIEST upcoming/current reservation
    const resMap = new Map<string, { guest_name: string; checkin_at: string; checkout_at: string; occupied: boolean; upcoming: boolean }>()
    const nowIso = now.toISOString()
    for (const r of (resData ?? [])) {
      const isNow = r.checkin_at <= nowIso && r.checkout_at > nowIso
      const entry = resMap.get(r.room_id)
      // Prefer currently-occupied entry; then earliest upcoming
      if (!entry || (!entry.occupied && (isNow || r.checkin_at < entry.checkin_at))) {
        resMap.set(r.room_id, {
          guest_name:  r.guest_name,
          checkin_at:  r.checkin_at,
          checkout_at: r.checkout_at,
          occupied:    isNow,
          upcoming:    !isNow,
        })
      }
    }

    setRooms((roomData ?? []).map(room => {
      const res = resMap.get(room.id)
      return {
        ...room,
        cleaning_status: (room.cleaning_status ?? 'clean') as RoomCleaningStatus,
        occupied:    res?.occupied  ?? false,
        upcoming:    res?.upcoming  ?? false,
        guest_name:  res?.guest_name,
        checkin_at:  res?.checkin_at,
        checkout_at: res?.checkout_at,
      }
    }))
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function cycleStatus(room: RoomWithStatus) {
    const next = NEXT_STATUS[room.cleaning_status]
    setSaving(room.id)
    await supabase.from('rooms').update({
      cleaning_status: next,
      cleaning_updated_at: new Date().toISOString(),
    }).eq('id', room.id)
    setSaving(null)
    load()
  }

  const summary = {
    total:       rooms.length,
    occupied:    rooms.filter(r => r.occupied).length,
    upcoming:    rooms.filter(r => r.upcoming).length,
    clean:       rooms.filter(r => r.cleaning_status === 'clean').length,
    dirty:       rooms.filter(r => r.cleaning_status === 'dirty').length,
    maintenance: rooms.filter(r => r.cleaning_status === 'maintenance').length,
  }

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Zimmerstatus</h1>
          <p className="text-slate-500 mt-1">Auf eine Karte klicken zum Wechseln des Status</p>
        </div>
        <button onClick={() => load()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
          ↻ Aktualisieren
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Gesamt',        value: summary.total,                          color: 'text-slate-900' },
          { label: 'Belegt',        value: summary.occupied,                       color: 'text-blue-700'  },
          { label: 'Anreise 14 T.', value: summary.upcoming,                       color: 'text-violet-700'},
          { label: 'Frei',          value: summary.total - summary.occupied - summary.upcoming, color: 'text-slate-500' },
          { label: 'Sauber',        value: summary.clean,                          color: 'text-green-700' },
          { label: 'Reinigen',      value: summary.dirty,                          color: 'text-amber-700' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Status cycle legend */}
      <div className="flex items-center gap-3 mb-4 text-xs text-slate-500">
        <span className="font-medium">Klicken zum Wechseln:</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Sauber</span>
        <span>→</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Reinigen</span>
        <span>→</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Wartung</span>
        <span>→</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Sauber</span>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400 text-sm">Lädt…</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {rooms.map(room => {
            const cfg = STATUS_CONFIG[room.cleaning_status]
            const isSaving = saving === room.id
            return (
              <button
                key={room.id}
                onClick={() => cycleStatus(room)}
                disabled={isSaving}
                className={cn(
                  'relative rounded-xl border-2 p-3 text-left transition-all hover:shadow-md active:scale-95',
                  cfg.bg,
                  isSaving && 'opacity-50 cursor-wait',
                )}
              >
                {/* Occupied / upcoming indicator dot */}
                {room.occupied && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500" title="Belegt" />
                )}
                {!room.occupied && room.upcoming && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-violet-400" title="Anreise in Kürze" />
                )}

                <div className="flex items-center gap-1.5 mb-2">
                  <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', cfg.dot)} />
                  <span className="text-base font-bold text-slate-800">Zi. {room.room_number}</span>
                </div>

                <p className="text-xs text-slate-500 truncate mb-1">{getRoomFloor(room.room_number)}</p>

                <span className={cn('inline-flex rounded-full px-2 py-0.5 text-2xs font-semibold', cfg.badge)}>
                  {cfg.label}
                </span>

                {/* Currently occupied */}
                {room.occupied && room.guest_name && (
                  <p className="mt-1.5 text-2xs text-blue-600 font-medium truncate">
                    {room.guest_name}
                  </p>
                )}
                {room.occupied && room.checkout_at && (
                  <p className="text-2xs text-slate-400 truncate">
                    Abreise {format(new Date(room.checkout_at), 'd. MMM')}
                  </p>
                )}

                {/* Upcoming (not yet checked in) */}
                {!room.occupied && room.upcoming && room.guest_name && (
                  <p className="mt-1.5 text-2xs text-violet-600 font-medium truncate">
                    {room.guest_name}
                  </p>
                )}
                {!room.occupied && room.upcoming && room.checkin_at && (
                  <p className="text-2xs text-violet-400 truncate">
                    Anreise {format(new Date(room.checkin_at), 'd. MMM')}
                  </p>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
