'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAdmin } from '@/hooks/useAdmin'
import { Lock, Eye, EyeOff, Save, RefreshCw } from 'lucide-react'
import type { Locker } from '@/types/database'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/reservations'

export default function LockersPage() {
  const supabase        = createClient()
  const { isAdmin, loading: adminLoading } = useAdmin()
  const [lockers,  setLockers]  = useState<Locker[]>([])
  const [loading,  setLoading]  = useState(true)
  const [edits,    setEdits]    = useState<Record<string, string>>({})  // id → new pin
  const [saving,   setSaving]   = useState<string | null>(null)
  const [showPins, setShowPins] = useState(false)
  const [saved,    setSaved]    = useState<string | null>(null)

  useEffect(() => { if (!adminLoading) load() }, [adminLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('lockers').select('*').order('locker_number')
    setLockers((data ?? []) as Locker[])
    // Seed edit values from current pins
    const map: Record<string, string> = {}
    ;(data ?? []).forEach((l: Locker) => { map[l.id] = l.pin_code })
    setEdits(map)
    setLoading(false)
  }

  async function savePin(locker: Locker) {
    const newPin = edits[locker.id]?.trim()
    if (!newPin || newPin === locker.pin_code) return
    setSaving(locker.id)
    await supabase.from('lockers').update({ pin_code: newPin }).eq('id', locker.id)
    setSaving(null)
    setSaved(locker.id)
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
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Lock className="w-6 h-6 text-slate-600" />
            Schließfach-PINs
          </h1>
          <p className="text-slate-500 mt-1">PIN-Codes für die Rezeptionsschließfächer verwalten</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPins(p => !p)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            {showPins ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPins ? 'PINs verbergen' : 'PINs anzeigen'}
          </button>
          <button onClick={load}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <RefreshCw className="w-4 h-4" />
            Aktualisieren
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Lädt…</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {lockers.map(locker => {
            const isSaving  = saving === locker.id
            const justSaved = saved  === locker.id
            const edited    = edits[locker.id] !== locker.pin_code
            return (
              <div key={locker.id}
                className={cn(
                  'bg-white rounded-xl border-2 p-4 transition-all',
                  justSaved ? 'border-green-300 bg-green-50' : edited ? 'border-blue-300' : 'border-slate-200',
                )}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-slate-500" />
                    </div>
                    <span className="font-bold text-slate-800">Nr. {locker.locker_number}</span>
                  </div>
                  {justSaved && <span className="text-xs text-green-600 font-medium">✓ Gespeichert</span>}
                </div>

                {/* PIN input */}
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">PIN-Code</label>
                  <input
                    type={showPins ? 'text' : 'password'}
                    value={edits[locker.id] ?? locker.pin_code}
                    onChange={e => setEdits(prev => ({ ...prev, [locker.id]: e.target.value }))}
                    maxLength={10}
                    className={cn(
                      'w-full rounded-lg border px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500',
                      edited ? 'border-blue-400 bg-blue-50' : 'border-slate-300',
                    )}
                    placeholder="0000"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => savePin(locker)}
                    disabled={isSaving || !edited}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
                      edited
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed',
                    )}>
                    <Save className="w-3.5 h-3.5" />
                    {isSaving ? 'Speichert…' : 'Speichern'}
                  </button>
                  <button
                    onClick={() => setEdits(prev => ({ ...prev, [locker.id]: randomPin() }))}
                    title="Zufälligen PIN generieren"
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-slate-500 hover:bg-slate-50 transition-colors text-xs">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="mt-2 text-2xs text-slate-400">
                  Geändert: {formatDateTime(locker.updated_at)}
                </p>
              </div>
            )
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400 flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5" />
        PIN-Änderungen werden sofort gespeichert. Nur für Administratoren sichtbar.
      </p>
    </div>
  )
}
