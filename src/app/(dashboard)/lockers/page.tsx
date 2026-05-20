'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAdmin } from '@/hooks/useAdmin'
import { Lock, Eye, EyeOff, Save, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/cn'

interface RoomWithPin {
  id: string
  room_number: string
  name: string
  locker_pin: string
  sort_order: number
}

export default function LockersPage() {
  const supabase = createClient()
  const { isAdmin, loading: adminLoading } = useAdmin()
  const [rooms,    setRooms]    = useState<RoomWithPin[]>([])
  const [loading,  setLoading]  = useState(true)
  const [edits,    setEdits]    = useState<Record<string, string>>({})   // room.id → new pin
  const [saving,   setSaving]   = useState<string | null>(null)
  const [saved,    setSaved]    = useState<string | null>(null)
  const [showPins, setShowPins] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('rooms')
      .select('id, room_number, name, locker_pin, sort_order')
      .eq('is_active', true)
      .order('sort_order')

    const rows = (data ?? []) as RoomWithPin[]
    setRooms(rows)
    const map: Record<string, string> = {}
    rows.forEach(r => { map[r.id] = r.locker_pin })
    setEdits(map)
    setLoading(false)
  }, [supabase])

  useEffect(() => { if (!adminLoading) load() }, [adminLoading, load])

  async function savePin(room: RoomWithPin) {
    const newPin = edits[room.id]?.trim()
    if (!newPin || newPin === room.locker_pin) return
    setSaving(room.id)
    await supabase
      .from('rooms')
      .update({ locker_pin: newPin })
      .eq('id', room.id)
    setSaving(null)
    setSaved(room.id)
    setTimeout(() => setSaved(null), 2000)
    load()
  }

  function randomPin() {
    return String(Math.floor(1000 + Math.random() * 9000))
  }

  if (!adminLoading && !isAdmin) {
    return (
      <div className="px-6 py-8 text-center">
        <Lock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Kein Zugriff. Diese Seite ist nur für Administratoren.</p>
      </div>
    )
  }

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Lock className="w-6 h-6 text-slate-600" />
            Schließfach-PINs
          </h1>
          <p className="text-slate-500 mt-1">Jedes Zimmer hat ein eigenes Schließfach — PINs hier verwalten</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPins(p => !p)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {showPins ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPins ? 'PINs verbergen' : 'PINs anzeigen'}
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Aktualisieren
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Lädt…</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {rooms.map(room => {
            const isSaving  = saving  === room.id
            const justSaved = saved   === room.id
            const edited    = edits[room.id] !== room.locker_pin

            return (
              <div
                key={room.id}
                className={cn(
                  'bg-white rounded-xl border-2 p-4 transition-all',
                  justSaved
                    ? 'border-green-300 bg-green-50'
                    : edited
                      ? 'border-blue-300'
                      : 'border-slate-200',
                )}
              >
                {/* Room info */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-white">{room.room_number}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">Zi. {room.room_number}</p>
                    </div>
                  </div>
                  {justSaved && <span className="text-xs text-green-600 font-medium flex-shrink-0">✓</span>}
                </div>

                <p className="text-xs text-slate-400 truncate mb-3">{room.name}</p>

                {/* PIN input */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    <Lock className="w-3 h-3 inline mr-1" />
                    PIN
                  </label>
                  <input
                    type={showPins ? 'text' : 'password'}
                    value={edits[room.id] ?? room.locker_pin}
                    onChange={e => setEdits(prev => ({ ...prev, [room.id]: e.target.value }))}
                    maxLength={10}
                    className={cn(
                      'w-full rounded-lg border px-2 py-1.5 text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-500',
                      edited ? 'border-blue-400 bg-blue-50' : 'border-slate-300',
                    )}
                    placeholder="0000"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => savePin(room)}
                    disabled={isSaving || !edited}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
                      edited
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed',
                    )}
                  >
                    <Save className="w-3 h-3" />
                    {isSaving ? '…' : 'Speichern'}
                  </button>
                  <button
                    onClick={() => setEdits(prev => ({ ...prev, [room.id]: randomPin() }))}
                    title="Zufälligen PIN generieren"
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400 flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5" />
        Der PIN wird automatisch in der Buchungsbestätigung (E-Mail &amp; PDF) an den Gast übermittelt.
        Nur für Administratoren sichtbar.
      </p>
    </div>
  )
}
