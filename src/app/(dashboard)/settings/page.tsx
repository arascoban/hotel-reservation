'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAdmin } from '@/hooks/useAdmin'
import { cn } from '@/lib/cn'
import { SlidersHorizontal, ShieldCheck, Loader2, Eye, EyeOff, Wallet, BedDouble } from 'lucide-react'

interface RoomTypeRow {
  id:           string
  name:         string
  category:     string
  base_price:   number | null
  max_adults:   number | null
  max_children: number | null
  max_capacity: number
  sort_order:   number
}

interface MenuRow {
  menu_key:          string
  label:             string
  visible_for_staff: boolean
  sort_order:        number
}

export default function SettingsPage() {
  const supabase              = createClient()
  const { isAdmin, loading: adminLoading } = useAdmin()
  const [rows,    setRows]    = useState<MenuRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState<string | null>(null)
  const [msg,     setMsg]     = useState('')
  const [depositPct,    setDepositPct]    = useState('30')
  const [savingDeposit, setSavingDeposit] = useState(false)
  const [roomTypes,     setRoomTypes]     = useState<RoomTypeRow[]>([])
  const [prices,        setPrices]        = useState<Record<string, string>>({})
  const [caps,          setCaps]          = useState<Record<string, { a: string; c: string; t: string }>>({})
  const [savingPrice,   setSavingPrice]   = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('menu_visibility')
      .select('menu_key, label, visible_for_staff, sort_order')
      .order('sort_order')
    if (data) setRows(data as MenuRow[])

    const { data: types } = await supabase
      .from('room_types').select('id, name, category, base_price, max_adults, max_children, max_capacity, sort_order').order('sort_order')
    if (types) {
      setRoomTypes(types as RoomTypeRow[])
      setPrices(Object.fromEntries((types as RoomTypeRow[]).map(
        t => [t.id, t.base_price != null ? String(t.base_price) : ''],
      )))
      setCaps(Object.fromEntries((types as RoomTypeRow[]).map(t => [t.id, {
        a: String(t.max_adults   ?? ''),
        c: String(t.max_children ?? ''),
        t: String(t.max_capacity ?? ''),
      }])))
    }

    const { data: settings } = await supabase
      .from('invoice_settings').select('default_deposit_percent').eq('id', 1).single()
    const pct = (settings as { default_deposit_percent?: number } | null)?.default_deposit_percent
    if (pct != null) setDepositPct(String(pct))

    setLoading(false)
  }, [supabase])

  async function saveRoomType(t: RoomTypeRow) {
    const raw   = prices[t.id]
    const price = raw === '' ? null : parseFloat(raw)
    if (price != null && (Number.isNaN(price) || price < 0)) return

    const c = caps[t.id] ?? { a: '', c: '', t: '' }
    const adults   = c.a === '' ? null : parseInt(c.a)
    const children = c.c === '' ? null : parseInt(c.c)
    const total    = c.t === '' ? t.max_capacity : parseInt(c.t)
    if (adults != null && adults < 1) return
    if (total < 1) return

    setSavingPrice(t.id)
    const { error } = await supabase.from('room_types').update({
      base_price:   price,
      max_adults:   adults,
      max_children: children,
      max_capacity: total,
    }).eq('id', t.id)

    if (!error) {
      setRoomTypes(prev => prev.map(r => r.id === t.id
        ? { ...r, base_price: price, max_adults: adults, max_children: children, max_capacity: total }
        : r))
      setMsg('✓ Gespeichert'); setTimeout(() => setMsg(''), 2000)
    }
    setSavingPrice(null)
  }

  function capChanged(t: RoomTypeRow): boolean {
    const c = caps[t.id]
    if (!c) return false
    return c.a !== String(t.max_adults   ?? '')
        || c.c !== String(t.max_children ?? '')
        || c.t !== String(t.max_capacity ?? '')
        || (prices[t.id] ?? '') !== (t.base_price != null ? String(t.base_price) : '')
  }

  async function saveDepositPct() {
    const pct = parseFloat(depositPct)
    if (Number.isNaN(pct) || pct < 0 || pct > 100) return
    setSavingDeposit(true)
    const { error } = await supabase
      .from('invoice_settings').update({ default_deposit_percent: pct }).eq('id', 1)
    if (!error) { setMsg('✓ Gespeichert'); setTimeout(() => setMsg(''), 2000) }
    setSavingDeposit(false)
  }

  useEffect(() => { load() }, [load])

  async function toggle(row: MenuRow) {
    setSaving(row.menu_key)
    const next = !row.visible_for_staff
    const { error } = await supabase
      .from('menu_visibility')
      .update({
        visible_for_staff: next,
        updated_by: (await supabase.auth.getUser()).data.user?.email ?? null,
      })
      .eq('menu_key', row.menu_key)

    if (!error) {
      setRows(prev => prev.map(r =>
        r.menu_key === row.menu_key ? { ...r, visible_for_staff: next } : r))
      setMsg('✓ Gespeichert')
      setTimeout(() => setMsg(''), 2000)
    }
    setSaving(null)
  }

  if (adminLoading) {
    return <div className="p-8 text-slate-400 text-sm">Lädt…</div>
  }

  // Non-admins have no business here — the RLS policy would reject the write
  // anyway, but showing the page would just be confusing.
  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <ShieldCheck className="w-8 h-8 text-amber-500 mx-auto mb-3" />
          <p className="font-semibold text-amber-800">Nur für Administratoren</p>
          <p className="text-sm text-amber-600 mt-1">
            Diese Seite ist dem Hotel-Administrator vorbehalten.
          </p>
        </div>
      </div>
    )
  }

  const hiddenCount = rows.filter(r => !r.visible_for_staff).length

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-8 w-full max-w-3xl">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <SlidersHorizontal className="w-6 h-6 text-slate-500" />
          Einstellungen
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Menü-Sichtbarkeit, Zimmerpreise und Belegung.
          {hiddenCount > 0 && (
            <span className="ml-1 font-medium text-slate-700">
              {hiddenCount} Menü{hiddenCount !== 1 ? 's' : ''} ausgeblendet.
            </span>
          )}
        </p>
      </div>

      {/* Admin notice */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <ShieldCheck className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Als Administrator siehst du <strong>immer alle Menüs</strong> — diese Schalter
          betreffen ausschließlich Mitarbeiter-Konten. So kannst du dich nicht
          versehentlich selbst aussperren.
        </p>
      </div>

      {msg && (
        <p className="mb-3 text-sm font-medium text-green-600">{msg}</p>
      )}

      {/* Switches */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">Lädt…</div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {rows.map((row, idx) => (
            <div
              key={row.menu_key}
              className={cn(
                'flex items-center gap-4 px-5 py-4',
                idx < rows.length - 1 && 'border-b border-slate-100',
                !row.visible_for_staff && 'bg-slate-50',
              )}
            >
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'font-semibold text-sm',
                  row.visible_for_staff ? 'text-slate-900' : 'text-slate-400',
                )}>
                  {row.label}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {row.visible_for_staff
                    ? 'Für Mitarbeiter sichtbar'
                    : 'Für Mitarbeiter ausgeblendet'}
                </p>
              </div>

              {row.visible_for_staff
                ? <Eye    className="w-4 h-4 text-green-500 flex-shrink-0" />
                : <EyeOff className="w-4 h-4 text-slate-300 flex-shrink-0" />
              }

              {/* Toggle switch */}
              <button
                onClick={() => toggle(row)}
                disabled={saving === row.menu_key}
                role="switch"
                aria-checked={row.visible_for_staff}
                aria-label={`${row.label} für Mitarbeiter ${row.visible_for_staff ? 'ausblenden' : 'anzeigen'}`}
                className={cn(
                  'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
                  row.visible_for_staff ? 'bg-green-500' : 'bg-slate-300',
                )}
              >
                <span className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transform transition-transform',
                  row.visible_for_staff ? 'translate-x-[22px]' : 'translate-x-0.5',
                )}>
                  {saving === row.menu_key && (
                    <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                  )}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Room base prices ───────────────────────────────────────────── */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-1">
          <BedDouble className="w-5 h-5 text-slate-500" />
          Zimmerpreise
        </h2>
        <p className="text-slate-500 text-sm mb-4">
          Preis pro Nacht <strong>inklusive Frühstück</strong>, je Zimmertyp.
          Wird bei Gruppenbuchungen vorgeschlagen und bleibt dort änderbar.
        </p>

        {loading ? (
          <div className="text-center py-10 text-slate-400 text-sm">Lädt…</div>
        ) : (
          <div className="space-y-2.5">
            {roomTypes.map(t => (
              <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-slate-900 truncate">{t.name}</p>
                    <p className="text-xs text-slate-400">
                      {t.base_price != null ? `${t.base_price.toFixed(2)} € / Nacht` : 'Kein Preis'}
                      {' · '}max. {t.max_adults ?? '?'} Erw.
                      {(t.max_children ?? 0) > 0 && ` + ${t.max_children} Ki.`}
                      {' · '}insg. {t.max_capacity}
                    </p>
                  </div>
                  <button
                    onClick={() => saveRoomType(t)}
                    disabled={savingPrice === t.id || !capChanged(t)}
                    className="flex-shrink-0 rounded-xl bg-blue-600 text-white px-4 h-11 text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    {savingPrice === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Speichern'}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-2xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                      Preis / Nacht
                    </label>
                    <div className="relative">
                      <input type="number" min={0} step="0.01"
                        value={prices[t.id] ?? ''}
                        onChange={e => setPrices(p => ({ ...p, [t.id]: e.target.value }))}
                        placeholder="0.00"
                        aria-label={`Preis für ${t.name}`}
                        className="w-full rounded-lg border border-slate-300 pl-3 pr-6 h-11 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-2xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                      Max. Erwachsene
                    </label>
                    <input type="number" min={1} max={10}
                      value={caps[t.id]?.a ?? ''}
                      onChange={e => setCaps(c => ({ ...c, [t.id]: { ...c[t.id], a: e.target.value } }))}
                      aria-label={`Maximale Erwachsene für ${t.name}`}
                      className="w-full rounded-lg border border-slate-300 px-3 h-11 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-2xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                      Max. Kinder
                    </label>
                    <input type="number" min={0} max={10}
                      value={caps[t.id]?.c ?? ''}
                      onChange={e => setCaps(c => ({ ...c, [t.id]: { ...c[t.id], c: e.target.value } }))}
                      aria-label={`Maximale Kinder für ${t.name}`}
                      className="w-full rounded-lg border border-slate-300 px-3 h-11 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-2xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                      Max. gesamt
                    </label>
                    <input type="number" min={1} max={10}
                      value={caps[t.id]?.t ?? ''}
                      onChange={e => setCaps(c => ({ ...c, [t.id]: { ...c[t.id], t: e.target.value } }))}
                      aria-label={`Maximale Personen gesamt für ${t.name}`}
                      className="w-full rounded-lg border border-slate-300 px-3 h-11 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <p className="text-2xs text-slate-400 mt-2">
                  „Max. gesamt" begrenzt Erwachsene und Kinder zusammen — z.&nbsp;B. 2 Erw. + 2 Ki.,
                  aber nie mehr als 3 Personen im Zimmer.
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Default deposit percentage ─────────────────────────────────── */}
      <div className="mt-8">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-1">
          <Wallet className="w-5 h-5 text-slate-500" />
          Anzahlung
        </h2>
        <p className="text-slate-500 text-sm mb-4">
          Vorgabe für neue Reservierungen — pro Buchung jederzeit änderbar.
        </p>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
              Standard-Anzahlung (%)
            </label>
            <input
              type="number" min={0} max={100} step="1"
              value={depositPct}
              onChange={e => setDepositPct(e.target.value)}
              className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={saveDepositPct}
            disabled={savingDeposit}
            className="rounded-xl bg-blue-600 text-white px-5 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {savingDeposit && <Loader2 className="w-4 h-4 animate-spin" />}
            {savingDeposit ? 'Speichern…' : 'Speichern'}
          </button>
          <p className="text-xs text-slate-400 flex-1 min-w-[200px]">
            0 % bedeutet: keine Anzahlung vorschlagen.
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Änderungen greifen, sobald ein Mitarbeiter die Seite neu lädt.
        Admin-Bereiche (iCal, Import, diese Seite) sind für Mitarbeiter
        grundsätzlich nicht sichtbar.
      </p>
    </div>
  )
}
