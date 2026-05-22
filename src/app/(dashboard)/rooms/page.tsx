'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import type { RoomCleaningStatus } from '@/types/database'
import { getRoomFloor } from '@/lib/reservations'
import { cn } from '@/lib/cn'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CleaningRequest {
  id:              string
  room_id:         string | null
  room_number:     string
  request_date:    string
  time_preference: string
  status:          'pending' | 'done' | 'cancelled'
  created_at:      string
  guest_name?:     string   // joined from reservation
}

interface RoomWithStatus {
  id:                  string
  room_number:         string
  name:                string
  cleaning_status:     RoomCleaningStatus
  cleaning_note:       string | null
  cleaning_updated_at: string
  guest_name?:         string
  checkin_at?:         string
  checkout_at?:        string
  occupied:            boolean
  upcoming:            boolean
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<RoomCleaningStatus, { label: string; bg: string; dot: string; badge: string }> = {
  clean:       { label: 'Sauber',   bg: 'bg-green-50 border-green-200', dot: 'bg-green-500', badge: 'bg-green-100 text-green-800' },
  dirty:       { label: 'Reinigen', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800' },
  maintenance: { label: 'Wartung',  bg: 'bg-red-50 border-red-200',     dot: 'bg-red-500',   badge: 'bg-red-100 text-red-700'    },
}

const NEXT_STATUS: Record<RoomCleaningStatus, RoomCleaningStatus> = {
  clean: 'dirty', dirty: 'maintenance', maintenance: 'clean',
}

const TIME_LABELS: Record<string, { short: string; long: string }> = {
  now:       { short: 'Sofort',      long: 'Sofort (so schnell wie möglich)' },
  morning:   { short: 'Vormittag',   long: 'Vormittag · 08:00 – 12:00 Uhr'  },
  afternoon: { short: 'Nachmittag',  long: 'Nachmittag · 12:00 – 17:00 Uhr' },
  evening:   { short: 'Abend',       long: 'Abend · 17:00 – 20:00 Uhr'      },
}

const TIME_EMOJI: Record<string, string> = {
  now: '⚡', morning: '🌅', afternoon: '☀️', evening: '🌆',
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)   return `vor ${diff}s`
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} min`
  return `vor ${Math.floor(diff / 3600)} h`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RoomsPage() {
  const supabase = createClient()

  const [rooms,    setRooms]    = useState<RoomWithStatus[]>([])
  const [requests, setRequests] = useState<CleaningRequest[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState<string | null>(null)   // room id for status cycle
  const [marking,  setMarking]  = useState<string | null>(null)   // request id for "mark done"

  const load = useCallback(async () => {
    setLoading(true)
    const now   = new Date()
    const today = format(now, 'yyyy-MM-dd')
    const in14  = format(new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')

    const [{ data: roomData }, { data: resData }, { data: cleanData }] = await Promise.all([
      supabase.from('rooms')
        .select('id, room_number, name, cleaning_status, cleaning_note, cleaning_updated_at')
        .eq('is_active', true)
        .order('sort_order'),

      supabase.from('reservations')
        .select('room_id, guest_name, checkin_at, checkout_at')
        .not('status', 'in', '("cancelled","no_show","checked_out")')
        .is('deleted_at', null)
        .lte('checkin_at', `${in14}T23:59:59`)
        .gte('checkout_at', `${today}T00:00:01`)
        .order('checkin_at'),

      supabase.from('cleaning_requests')
        .select('id, room_id, room_number, request_date, time_preference, status, created_at')
        .in('status', ['pending', 'done'])
        .gte('request_date', today)
        .order('created_at', { ascending: false }),
    ])

    // Map reservations → rooms
    const resMap = new Map<string, { guest_name: string; checkin_at: string; checkout_at: string; occupied: boolean; upcoming: boolean }>()
    const nowIso = now.toISOString()
    for (const r of (resData ?? [])) {
      const isNow = r.checkin_at <= nowIso && r.checkout_at > nowIso
      const entry = resMap.get(r.room_id)
      if (!entry || (!entry.occupied && (isNow || r.checkin_at < entry.checkin_at))) {
        resMap.set(r.room_id, { guest_name: r.guest_name, checkin_at: r.checkin_at, checkout_at: r.checkout_at, occupied: isNow, upcoming: !isNow })
      }
    }

    setRooms((roomData ?? []).map(room => {
      const res = resMap.get(room.id)
      return {
        ...room,
        cleaning_status: (room.cleaning_status ?? 'clean') as RoomCleaningStatus,
        occupied:   res?.occupied   ?? false,
        upcoming:   res?.upcoming   ?? false,
        guest_name: res?.guest_name,
        checkin_at: res?.checkin_at,
        checkout_at:res?.checkout_at,
      }
    }))

    // Enrich cleaning requests with guest name from resMap
    const roomByNumber = new Map((roomData ?? []).map(r => [r.room_number, r.id]))
    setRequests((cleanData ?? []).map(req => {
      const rid  = req.room_id ?? roomByNumber.get(req.room_number) ?? null
      const guest = rid ? resMap.get(rid)?.guest_name : undefined
      return { ...req, guest_name: guest } as CleaningRequest
    }))

    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Cycle cleaning status on room card click
  async function cycleStatus(room: RoomWithStatus) {
    const next = NEXT_STATUS[room.cleaning_status]
    setSaving(room.id)
    await supabase.from('rooms').update({
      cleaning_status:     next,
      cleaning_updated_at: new Date().toISOString(),
    }).eq('id', room.id)
    setSaving(null)
    load()
  }

  // Mark a cleaning request as done
  async function markDone(req: CleaningRequest) {
    setMarking(req.id)
    await supabase.from('cleaning_requests').update({ status: 'done' }).eq('id', req.id)
    setMarking(null)
    load()
  }

  // Mark a cleaning request as cancelled
  async function cancelRequest(req: CleaningRequest) {
    setMarking(req.id)
    await supabase.from('cleaning_requests').update({ status: 'cancelled' }).eq('id', req.id)
    setMarking(null)
    load()
  }

  const pendingRequests = requests.filter(r => r.status === 'pending')
  const doneRequests    = requests.filter(r => r.status === 'done')

  const summary = {
    total:    rooms.length,
    occupied: rooms.filter(r => r.occupied).length,
    upcoming: rooms.filter(r => r.upcoming).length,
    clean:    rooms.filter(r => r.cleaning_status === 'clean').length,
    dirty:    rooms.filter(r => r.cleaning_status === 'dirty').length,
    pending:  pendingRequests.length,
  }

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-8 max-w-6xl mx-auto space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Zimmerstatus</h1>
          <p className="text-slate-500 mt-1 text-sm">Auf eine Karte klicken zum Wechseln des Reinigungsstatus</p>
        </div>
        <button
          onClick={() => load()}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors flex-shrink-0"
        >
          ↻ Aktualisieren
        </button>
      </div>

      {/* ── Summary bar ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3">
        {[
          { label: 'Gesamt',        value: summary.total,                                        color: 'text-slate-900'  },
          { label: 'Belegt',        value: summary.occupied,                                     color: 'text-blue-700'   },
          { label: 'Anreise 14 T.', value: summary.upcoming,                                     color: 'text-violet-700' },
          { label: 'Frei',          value: summary.total - summary.occupied - summary.upcoming,  color: 'text-slate-500'  },
          { label: 'Sauber',        value: summary.clean,                                        color: 'text-green-700'  },
          { label: '🧹 Anfragen',   value: summary.pending,                                      color: 'text-cyan-700'   },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 text-center">
            <p className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-1 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          CLEANING REQUESTS SECTION  (separate from room grid)
      ══════════════════════════════════════════════════════════════════════ */}
      <section>
        {/* Section header */}
        <div className="bg-white border-b border-slate-200 rounded-t-2xl px-5 py-4 flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900">Reinigungsanfragen</h2>
          {pendingRequests.length > 0 && (
            <span className="bg-cyan-600 text-white text-xs font-bold rounded-full px-2.5 py-1">
              {pendingRequests.length} offen
            </span>
          )}
          <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium ml-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        </div>

        <div className="bg-slate-50 rounded-b-2xl p-5 space-y-6">

          {/* Active / pending requests */}
          {loading ? (
            <p className="text-center py-8 text-slate-400 text-sm">Lädt…</p>
          ) : pendingRequests.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-4xl mb-3">🧹</p>
              <p className="font-medium text-slate-500">Keine offenen Reinigungsanfragen</p>
              <p className="text-sm mt-1">Neue Anfragen erscheinen hier automatisch.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Offene Anfragen</h3>
              {pendingRequests.map(req => {
                const isMarking = marking === req.id
                const timeInfo  = TIME_LABELS[req.time_preference] ?? { short: req.time_preference, long: req.time_preference }
                const emoji     = TIME_EMOJI[req.time_preference] ?? '🧹'
                const isToday   = req.request_date === format(new Date(), 'yyyy-MM-dd')
                const dateLabel = isToday ? 'Heute' : format(new Date(req.request_date), 'EEEE, d. MMM', { locale: de })
                return (
                  <div
                    key={req.id}
                    className="bg-white rounded-2xl shadow-sm border border-cyan-300 shadow-cyan-100 overflow-hidden transition-all"
                  >
                    {/* Card header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="bg-slate-900 text-white rounded-xl px-3 py-1.5 font-bold text-lg">
                          Zi. {req.room_number}
                        </div>
                        <span className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold bg-cyan-100 text-cyan-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                          Ausstehend
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">{timeAgo(req.created_at)}</span>
                    </div>

                    {/* Card body */}
                    <div className="px-5 py-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <span className="text-lg">{emoji}</span>
                        <span className="font-semibold">{timeInfo.long}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span>📅</span>
                        <span>{dateLabel}</span>
                      </div>
                      {req.guest_name && (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <span>👤</span>
                          <span>{req.guest_name}</span>
                        </div>
                      )}
                    </div>

                    {/* Card footer */}
                    <div className="flex items-center justify-end gap-2 px-5 py-3 bg-slate-50 border-t border-slate-100">
                      <button
                        onClick={() => cancelRequest(req)}
                        disabled={isMarking}
                        className="rounded-xl bg-slate-100 text-slate-500 px-4 py-2 text-sm font-medium hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
                      >
                        Ablehnen
                      </button>
                      <button
                        onClick={() => markDone(req)}
                        disabled={isMarking}
                        className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors"
                      >
                        {isMarking ? '…' : '✅ Gereinigt'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Done requests (history) */}
          {doneRequests.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Erledigt heute</h3>
              {doneRequests.map(req => {
                const timeInfo  = TIME_LABELS[req.time_preference] ?? { short: req.time_preference, long: req.time_preference }
                const emoji     = TIME_EMOJI[req.time_preference] ?? '🧹'
                return (
                  <div key={req.id} className="bg-white rounded-xl border border-slate-200 px-5 py-3 flex items-center justify-between opacity-50">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-700 text-sm">Zi. {req.room_number}</span>
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">✅ Gereinigt</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>{emoji} {timeInfo.short}</span>
                      <span>{timeAgo(req.created_at)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          ROOM GRID  (cleaning status only — no cleaning request display here)
      ══════════════════════════════════════════════════════════════════════ */}
      <section>
        {/* Legend */}
        <div className="hidden sm:flex items-center gap-3 mb-4 text-xs text-slate-500">
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
              const cfg      = STATUS_CONFIG[room.cleaning_status]
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

                  {room.occupied && room.guest_name && (
                    <p className="mt-1.5 text-2xs text-blue-600 font-medium truncate">{room.guest_name}</p>
                  )}
                  {room.occupied && room.checkout_at && (
                    <p className="text-2xs text-slate-400 truncate">Abreise {format(new Date(room.checkout_at), 'd. MMM')}</p>
                  )}
                  {!room.occupied && room.upcoming && room.guest_name && (
                    <p className="mt-1.5 text-2xs text-violet-600 font-medium truncate">{room.guest_name}</p>
                  )}
                  {!room.occupied && room.upcoming && room.checkin_at && (
                    <p className="text-2xs text-violet-400 truncate">Anreise {format(new Date(room.checkin_at), 'd. MMM')}</p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </section>

    </div>
  )
}
