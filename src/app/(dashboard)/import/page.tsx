'use client'

import { useState, useRef } from 'react'
import { Upload, AlertTriangle, CheckCircle2, Loader2, XCircle, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'

// ── Types ─────────────────────────────────────────────────────────────────

interface AvailableRoom { id: string; room_number: string; name: string }

interface ImportRow {
  tempId: string
  guestName: string
  checkin: string
  checkout: string
  guestCount: number
  totalPrice: number | null
  commission: number | null
  bookingNumber: string
  roomTypeRaw: string
  dbCategory: string
  paymentStatus: string
  paymentMethod: string
  isFamily: boolean
  splitCount: number
  parseWarnings: string[]
  availableRooms: AvailableRoom[]
  suggestedRoomId: string | null
}

interface EditRow extends ImportRow {
  assignedRoomId: string
  skip: boolean
  editedName: string
  editedCheckin: string
  editedCheckout: string
  editedGuests: number
  editedPrice: string
  editedPayStatus: string
  editedPayMethod: string
  editedNotes: string
}

// ── Helpers ───────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  single:      'Einzelzimmer',
  double:      'Doppelzimmer',
  double_sofa: 'Doppelzimmer mit Schlafsofa',
  family:      'Familienzimmer',
  unknown:     'Unbekannt',
}

const PAY_STATUS_OPTS = [
  { value: 'unpaid',  label: 'Offen' },
  { value: 'paid',    label: 'Bezahlt' },
]

const PAY_METHOD_OPTS = [
  { value: 'unpaid',       label: 'Noch offen' },
  { value: 'online',       label: 'Booking.com (Online)' },
  { value: 'cash',         label: 'Bar' },
  { value: 'ec_card',      label: 'EC-Karte' },
  { value: 'credit_card',  label: 'Kreditkarte' },
]

function toEditRow(r: ImportRow): EditRow {
  return {
    ...r,
    assignedRoomId: r.suggestedRoomId === '__DUPLICATE__' ? '' : (r.suggestedRoomId ?? ''),
    skip: r.suggestedRoomId === '__DUPLICATE__',
    editedName:      r.guestName,
    editedCheckin:   r.checkin,
    editedCheckout:  r.checkout,
    editedGuests:    r.guestCount,
    editedPrice:     r.totalPrice != null ? String(r.totalPrice) : '',
    editedPayStatus: r.paymentStatus,
    editedPayMethod: r.paymentMethod,
    editedNotes:     '',
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step,       setStep]       = useState<'upload' | 'review' | 'done'>('upload')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [rows,       setRows]       = useState<EditRow[]>([])
  const [importing,  setImporting]  = useState(false)
  const [doneCount,  setDoneCount]  = useState(0)
  const [failedBns,  setFailedBns]  = useState<string[]>([])
  const [dragging,   setDragging]   = useState(false)

  // ── File handling ──────────────────────────────────────────────────────

  async function handleFile(file: File) {
    if (!file.name.endsWith('.pdf')) {
      setError('Bitte eine PDF-Datei hochladen.')
      return
    }
    setLoading(true)
    setError('')

    const fd = new FormData()
    fd.append('pdf', file)

    const res = await fetch('/api/import/parse', { method: 'POST', body: fd })
    const json = await res.json()

    if (!res.ok || json.error) {
      setError(json.error ?? 'Fehler beim Verarbeiten der PDF.')
      setLoading(false)
      return
    }

    setRows((json.rows as ImportRow[]).map(toEditRow))
    setStep('review')
    setLoading(false)
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  // ── Row editing ────────────────────────────────────────────────────────

  function updateRow(tempId: string, patch: Partial<EditRow>) {
    setRows(prev => prev.map(r => r.tempId === tempId ? { ...r, ...patch } : r))
  }

  // ── Confirm import ─────────────────────────────────────────────────────

  async function handleImport() {
    setImporting(true)
    const payload = rows.map(r => ({
      roomId:        r.assignedRoomId,
      guestName:     r.editedName,
      checkin:       r.editedCheckin,
      checkout:      r.editedCheckout,
      guestCount:    r.editedGuests,
      totalPrice:    r.editedPrice ? parseFloat(r.editedPrice) : null,
      commission:    r.commission,
      bookingNumber: r.bookingNumber,
      paymentStatus: r.editedPayStatus,
      paymentMethod: r.editedPayMethod,
      notes:         r.editedNotes,
      skip:          r.skip || !r.assignedRoomId,
    }))

    const res  = await fetch('/api/import/confirm', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ rows: payload }),
    })
    const json = await res.json()

    setDoneCount(json.succeeded ?? 0)
    setFailedBns((json.failed ?? []).map((f: any) => f.bookingNumber))
    setImporting(false)
    setStep('done')
  }

  // ── UI ─────────────────────────────────────────────────────────────────

  const activeRows  = rows.filter(r => !r.skip)
  const skippedRows = rows.filter(r => r.skip)

  // ── Step: Upload ───────────────────────────────────────────────────────
  if (step === 'upload') return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Booking.com Import</h1>
        <p className="text-slate-500 text-sm mb-6">
          Reservierungsliste als PDF von Booking.com herunterladen und hier hochladen.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all',
            dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50',
          )}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="text-slate-600 font-medium">PDF wird verarbeitet…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="w-10 h-10 text-slate-400" />
              <p className="text-slate-700 font-semibold">PDF hier ablegen oder klicken</p>
              <p className="text-slate-400 text-sm">Booking.com → Reservierungen → Herunterladen</p>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={onFileInput} />

        {error && (
          <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="mt-6 bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-700 space-y-1">
          <p className="font-semibold">So gehts:</p>
          <p>1. Booking.com → Extranet → Reservierungen → Download-Symbol klicken</p>
          <p>2. PDF speichern und hier hochladen</p>
          <p>3. Im Review-Schritt Zimmer zuweisen und bestätigen</p>
        </div>
      </div>
    </div>
  )

  // ── Step: Done ─────────────────────────────────────────────────────────
  if (step === 'done') return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
      <h1 className="text-2xl font-bold text-slate-900 mb-2">{doneCount} Reservierungen importiert!</h1>
      {failedBns.length > 0 && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-sm text-red-700">
          <p className="font-semibold mb-1">Fehler bei {failedBns.length} Reservierungen:</p>
          {failedBns.map(bn => <p key={bn} className="font-mono">{bn}</p>)}
          <p className="mt-2 text-xs">Möglicherweise Zimmer bereits belegt — bitte manuell prüfen.</p>
        </div>
      )}
      <div className="flex gap-3 mt-8">
        <a href="/" className="rounded-xl bg-slate-900 text-white px-5 py-2.5 text-sm font-semibold hover:bg-slate-700 transition-colors">
          Zum Kalender
        </a>
        <button
          onClick={() => { setStep('upload'); setRows([]); setError('') }}
          className="rounded-xl border border-slate-300 text-slate-700 px-5 py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Weiteres PDF importieren
        </button>
      </div>
    </div>
  )

  // ── Step: Review ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-20">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Review — {rows.length} erkannte Reservierungen</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Bitte alle Felder prüfen, Zimmer zuweisen und dann importieren.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{activeRows.length} aktiv · {skippedRows.length} übersprungen</span>
            <button
              onClick={handleImport}
              disabled={importing || activeRows.length === 0}
              className="flex items-center gap-2 bg-blue-600 text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {importing ? 'Importiere…' : `${activeRows.length} importieren`}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-4">
        {rows.map((row, idx) => (
          <div
            key={row.tempId}
            className={cn(
              'bg-white rounded-2xl border shadow-sm overflow-hidden transition-all',
              row.skip ? 'opacity-40 border-slate-200' : 'border-slate-200',
              !row.assignedRoomId && !row.skip ? 'border-amber-300 shadow-amber-50' : '',
            )}
          >
            {/* Row header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-slate-400">#{row.bookingNumber}</span>
                {row.splitCount > 1 && (
                  <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 font-medium">
                    {row.isFamily ? 'Familienzimmer' : `${row.splitCount}× geteilt`} — Zimmer {rows.filter(r => r.bookingNumber === row.bookingNumber).indexOf(row) + 1}/{row.splitCount}
                  </span>
                )}
                <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                  {CATEGORY_LABEL[row.dbCategory] ?? row.roomTypeRaw}
                </span>
                {row.parseWarnings.map(w => (
                  <span key={w} className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {w}
                  </span>
                ))}
                {row.suggestedRoomId === '__DUPLICATE__' && (
                  <span className="text-xs bg-red-100 text-red-600 rounded-full px-2 py-0.5">Bereits importiert</span>
                )}
              </div>
              <button
                onClick={() => updateRow(row.tempId, { skip: !row.skip })}
                className={cn(
                  'text-xs font-medium rounded-lg px-3 py-1.5 transition-colors',
                  row.skip ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-red-50 text-red-600 hover:bg-red-100',
                )}
              >
                {row.skip ? '↩ Einschließen' : '✕ Überspringen'}
              </button>
            </div>

            {!row.skip && (
              <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-3 gap-4">

                {/* Guest name */}
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Gastname</label>
                  <input
                    type="text"
                    value={row.editedName}
                    onChange={e => updateRow(row.tempId, { editedName: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Check-in */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Check-in</label>
                  <input
                    type="date"
                    value={row.editedCheckin}
                    onChange={e => updateRow(row.tempId, { editedCheckin: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Check-out */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Check-out</label>
                  <input
                    type="date"
                    value={row.editedCheckout}
                    onChange={e => updateRow(row.tempId, { editedCheckout: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Room assignment — most important field */}
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Zimmer zuweisen
                    {!row.assignedRoomId && <span className="text-amber-600 ml-1">⚠ Pflichtfeld</span>}
                  </label>
                  {row.availableRooms.length === 0 ? (
                    <div className="flex items-center gap-2 border border-red-200 bg-red-50 rounded-lg px-3 py-2 text-sm text-red-600">
                      <XCircle className="w-4 h-4 flex-shrink-0" />
                      Keine freien Zimmer für diesen Zeitraum
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={row.assignedRoomId}
                        onChange={e => updateRow(row.tempId, { assignedRoomId: e.target.value })}
                        className={cn(
                          'w-full border rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500',
                          !row.assignedRoomId ? 'border-amber-400 bg-amber-50' : 'border-slate-200',
                        )}
                      >
                        <option value="">— Zimmer wählen —</option>
                        {row.availableRooms.map(r => (
                          <option key={r.id} value={r.id}>
                            Zimmer {r.room_number} — {r.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                  )}
                </div>

                {/* Guests */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Personen</label>
                  <input
                    type="number"
                    min={1} max={10}
                    value={row.editedGuests}
                    onChange={e => updateRow(row.tempId, { editedGuests: parseInt(e.target.value) || 1 })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Price */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    Preis (€)
                    {row.commission != null && (
                      <span className="ml-1 text-slate-400 font-normal">Provision: €{row.commission}</span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={row.editedPrice}
                    onChange={e => updateRow(row.tempId, { editedPrice: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Payment status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Zahlungsstatus</label>
                  <div className="relative">
                    <select
                      value={row.editedPayStatus}
                      onChange={e => updateRow(row.tempId, { editedPayStatus: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {PAY_STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Payment method */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Zahlungsart</label>
                  <div className="relative">
                    <select
                      value={row.editedPayMethod}
                      onChange={e => updateRow(row.tempId, { editedPayMethod: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {PAY_METHOD_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Notes */}
                <div className="col-span-2 md:col-span-3">
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Notizen (optional)</label>
                  <input
                    type="text"
                    value={row.editedNotes}
                    onChange={e => updateRow(row.tempId, { editedNotes: e.target.value })}
                    placeholder="z.B. Frühstück gewünscht, Allergien…"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

              </div>
            )}
          </div>
        ))}

        {/* Bottom import button */}
        <div className="sticky bottom-4 flex justify-end">
          <button
            onClick={handleImport}
            disabled={importing || activeRows.length === 0}
            className="flex items-center gap-2 bg-blue-600 text-white rounded-2xl px-8 py-3.5 text-sm font-bold shadow-lg hover:bg-blue-500 disabled:opacity-50 transition-all active:scale-95"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {importing ? 'Importiere…' : `✓ ${activeRows.length} Reservierungen importieren`}
          </button>
        </div>
      </div>
    </div>
  )
}
