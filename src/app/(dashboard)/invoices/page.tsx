'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient }  from '@/lib/supabase/client'
import { format }        from 'date-fns'
import { de }            from 'date-fns/locale'
import {
  FileText, Settings, ChevronRight, Hash, Trash2, Edit2,
  Plus, Search, X, Save, Loader2,
} from 'lucide-react'
import { useAdmin }      from '@/hooks/useAdmin'
import { cn }            from '@/lib/cn'
import Link              from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Invoice {
  id: string
  invoice_number: number
  guest_name: string
  guest_email: string | null
  guest_address: string | null
  room_number: string
  room_name: string
  checkin_at: string
  checkout_at: string
  nights: number
  total_price: number
  payment_method: string
  breakfast_included: boolean
  notes: string | null
  early_departure: boolean
  original_nights: number | null
  original_price: number | null
  guest_count: number
  breakfast_price_per_person: number
  room_service_total: number
  created_at: string
  created_by: string | null
}

interface Reservation {
  id: string
  guest_name: string
  guest_email: string | null
  guest_count: number
  room_id: string
  checkin_at: string
  checkout_at: string
  total_price: number | null
  payment_method: string
  breakfast_included: boolean
  billing_address: string | null
  guest_street: string | null
  guest_postcode: string | null
  guest_city: string | null
  guest_country: string | null
  notes: string | null
  rooms: { name: string; room_number: string }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAY_LABELS: Record<string, string> = {
  cash: 'Bar', ec_card: 'EC-Karte', credit_card: 'Kreditkarte', online: 'Online', unpaid: 'Ausstehend',
}
const PAY_OPTIONS = [
  { value: 'cash',        label: 'Bar' },
  { value: 'ec_card',     label: 'EC-Karte' },
  { value: 'credit_card', label: 'Kreditkarte' },
  { value: 'online',      label: 'Online' },
]

function fmtNum(n: number, year?: number) {
  const y = (year ?? new Date().getFullYear()).toString().slice(-2)
  return `R${y}_${String(n).padStart(3, '0')}`
}

// ── Helper: build guest address string ────────────────────────────────────────
function buildAddress(r: Reservation): string {
  const parts = [
    r.guest_street,
    [r.guest_postcode, r.guest_city].filter(Boolean).join(' '),
    r.guest_country,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('\n') : (r.billing_address ?? '')
}

// ── Field component ───────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}
const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// ── Edit Invoice Modal ────────────────────────────────────────────────────────

function EditModal({
  inv, isAdmin, onClose, onSaved,
}: {
  inv: Invoice; isAdmin: boolean; onClose: () => void; onSaved: (updated: Invoice) => void
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  // Editable fields
  const [guestName,    setGuestName]    = useState(inv.guest_name)
  const [guestEmail,   setGuestEmail]   = useState(inv.guest_email ?? '')
  const [guestAddress, setGuestAddress] = useState(inv.guest_address ?? '')
  const [roomName,     setRoomName]     = useState(inv.room_name)
  const [roomNumber,   setRoomNumber]   = useState(inv.room_number)
  const [checkinAt,    setCheckinAt]    = useState(inv.checkin_at.slice(0, 10))
  const [checkoutAt,   setCheckoutAt]   = useState(inv.checkout_at.slice(0, 10))
  const [nights,       setNights]       = useState(String(inv.nights))
  const [totalPrice,   setTotalPrice]   = useState(String(inv.total_price))
  const [payMethod,    setPayMethod]    = useState(inv.payment_method)
  const [breakfast,    setBreakfast]    = useState(inv.breakfast_included)
  const [guestCount,   setGuestCount]   = useState(String(inv.guest_count ?? 1))
  const [bfstPrice,    setBfstPrice]    = useState(String(inv.breakfast_price_per_person ?? 10))
  const [svcTotal,     setSvcTotal]     = useState(String(inv.room_service_total ?? 0))
  const [notes,        setNotes]        = useState(inv.notes ?? '')
  const [invoiceNum,   setInvoiceNum]   = useState(String(inv.invoice_number))

  async function handleSave() {
    setSaving(true); setError(null)
    const payload: Record<string, unknown> = {
      guest_name:                 guestName,
      guest_email:                guestEmail || null,
      guest_address:              guestAddress || null,
      room_name:                  roomName,
      room_number:                roomNumber,
      checkin_at:                 new Date(checkinAt).toISOString(),
      checkout_at:                new Date(checkoutAt).toISOString(),
      nights:                     parseInt(nights) || inv.nights,
      total_price:                parseFloat(totalPrice) || inv.total_price,
      payment_method:             payMethod,
      breakfast_included:         breakfast,
      guest_count:                parseInt(guestCount) || 1,
      breakfast_price_per_person: parseFloat(bfstPrice) || 10,
      room_service_total:         parseFloat(svcTotal) || 0,
      notes:                      notes || null,
    }
    if (isAdmin) payload.invoice_number = parseInt(invoiceNum) || inv.invoice_number

    const { data, error: err } = await supabase
      .from('invoices').update(payload).eq('id', inv.id).select('*').single()

    if (err) { setError(err.message); setSaving(false); return }
    onSaved(data as Invoice)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Rechnung bearbeiten · {fmtNum(inv.invoice_number, new Date(inv.created_at).getFullYear())}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-5">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          {/* Admin: invoice number */}
          {isAdmin && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <Field label="Rechnungsnummer (nur Admin)">
                <input type="number" value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} className={inp} />
              </Field>
            </div>
          )}

          {/* Guest info */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Gastname">
              <input value={guestName} onChange={e => setGuestName(e.target.value)} className={inp} />
            </Field>
            <Field label="E-Mail">
              <input value={guestEmail} onChange={e => setGuestEmail(e.target.value)} className={inp} />
            </Field>
          </div>
          <Field label="Adresse (Straße · PLZ Stadt · Land)">
            <textarea rows={3} value={guestAddress} onChange={e => setGuestAddress(e.target.value)}
              className={cn(inp, 'resize-none')} placeholder="Straße 1&#10;12345 Stadt&#10;Deutschland" />
          </Field>

          {/* Room + stay */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Field label="Zimmername">
                <input value={roomName} onChange={e => setRoomName(e.target.value)} className={inp} />
              </Field>
            </div>
            <Field label="Zimmernr.">
              <input value={roomNumber} onChange={e => setRoomNumber(e.target.value)} className={inp} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Anreise">
              <input type="date" value={checkinAt} onChange={e => setCheckinAt(e.target.value)} className={inp} />
            </Field>
            <Field label="Abreise">
              <input type="date" value={checkoutAt} onChange={e => setCheckoutAt(e.target.value)} className={inp} />
            </Field>
            <Field label="Nächte">
              <input type="number" min={1} value={nights} onChange={e => setNights(e.target.value)} className={inp} />
            </Field>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Gesamtpreis Übernachtung (€)">
              <input type="number" step="0.01" value={totalPrice} onChange={e => setTotalPrice(e.target.value)} className={inp} />
            </Field>
            <Field label="Zahlungsart">
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className={inp}>
                {PAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>

          {/* Breakfast */}
          <div className="grid grid-cols-3 gap-4 items-end">
            <div className="flex items-center gap-2 col-span-1 mt-5">
              <input type="checkbox" id="bfst" checked={breakfast} onChange={e => setBreakfast(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <label htmlFor="bfst" className="text-sm font-medium text-slate-700 cursor-pointer">Frühstück</label>
            </div>
            <Field label="Personen">
              <input type="number" min={1} value={guestCount} onChange={e => setGuestCount(e.target.value)} className={inp} disabled={!breakfast} />
            </Field>
            <Field label="Frühstück / Person (€)">
              <input type="number" step="0.01" value={bfstPrice} onChange={e => setBfstPrice(e.target.value)} className={inp} disabled={!breakfast} />
            </Field>
          </div>

          {/* Room service */}
          <Field label="Zimmerservice Gesamt (€)">
            <input type="number" step="0.01" value={svcTotal} onChange={e => setSvcTotal(e.target.value)} className={inp} />
          </Field>

          {/* Notes */}
          <Field label="Notizen">
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              className={cn(inp, 'resize-none')} placeholder="Interne Hinweise, Buchungsnummer…" />
          </Field>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Abbrechen
          </button>
          <button onClick={handleSave} disabled={saving}
            className="rounded-xl bg-blue-600 text-white px-5 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Create Invoice Modal ──────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (inv: Invoice) => void }) {
  const supabase    = createClient()
  const [step,      setStep]      = useState<'search' | 'form'>('search')
  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState<Reservation[]>([])
  const [searching, setSearching] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  // Form state (pre-filled from reservation or manual)
  const [guestName,    setGuestName]    = useState('')
  const [guestEmail,   setGuestEmail]   = useState('')
  const [guestAddress, setGuestAddress] = useState('')
  const [roomName,     setRoomName]     = useState('')
  const [roomNumber,   setRoomNumber]   = useState('')
  const [checkinAt,    setCheckinAt]    = useState(new Date().toISOString().slice(0, 10))
  const [checkoutAt,   setCheckoutAt]   = useState(new Date().toISOString().slice(0, 10))
  const [nights,       setNights]       = useState('1')
  const [totalPrice,   setTotalPrice]   = useState('')
  const [payMethod,    setPayMethod]    = useState('cash')
  const [breakfast,    setBreakfast]    = useState(false)
  const [guestCount,   setGuestCount]   = useState('1')
  const [bfstPrice,    setBfstPrice]    = useState('10')
  const [svcTotal,     setSvcTotal]     = useState('0')
  const [notes,        setNotes]        = useState('')
  const [reservationId, setReservationId] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleQueryChange(v: string) {
    setQuery(v)
    if (timer.current) clearTimeout(timer.current)
    if (!v.trim()) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('reservations')
        .select('id, guest_name, guest_email, guest_count, room_id, checkin_at, checkout_at, total_price, payment_method, breakfast_included, billing_address, guest_street, guest_postcode, guest_city, guest_country, notes, rooms(name, room_number)')
        .or(`guest_name.ilike.%${v}%,rooms.room_number.eq.${v}`)
        .in('status', ['confirmed', 'checked_in', 'checked_out'])
        .is('deleted_at', null)
        .order('checkin_at', { ascending: false })
        .limit(8)
      setResults((data ?? []) as Reservation[])
      setSearching(false)
    }, 300)
  }

  function prefill(r: Reservation) {
    const nights = Math.max(1, Math.round(
      (new Date(r.checkout_at).getTime() - new Date(r.checkin_at).getTime()) / 86400000
    ))
    setReservationId(r.id)
    setGuestName(r.guest_name)
    setGuestEmail(r.guest_email ?? '')
    setGuestAddress(buildAddress(r))
    setRoomName(r.rooms.name)
    setRoomNumber(r.rooms.room_number)
    setCheckinAt(r.checkin_at.slice(0, 10))
    setCheckoutAt(r.checkout_at.slice(0, 10))
    setNights(String(nights))
    setTotalPrice(String(r.total_price ?? ''))
    setPayMethod(r.payment_method)
    setBreakfast(r.breakfast_included)
    setGuestCount(String(r.guest_count))
    setNotes(r.notes ?? '')
    setStep('form')
  }

  async function handleCreate() {
    setSaving(true); setError(null)
    // Get next invoice number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: numData, error: numErr } = await (supabase as any).rpc('get_next_invoice_number')
    if (numErr) { setError('Rechnungsnummer konnte nicht generiert werden.'); setSaving(false); return }

    const { data: user } = await supabase.auth.getUser()
    const now = new Date().toISOString()
    const payload: Record<string, unknown> = {
      invoice_number:             numData as number,
      reservation_id:             reservationId,
      guest_name:                 guestName,
      guest_email:                guestEmail || null,
      guest_address:              guestAddress || null,
      room_name:                  roomName,
      room_number:                roomNumber,
      checkin_at:                 new Date(checkinAt).toISOString(),
      checkout_at:                new Date(checkoutAt).toISOString(),
      nights:                     parseInt(nights) || 1,
      total_price:                parseFloat(totalPrice) || 0,
      payment_method:             payMethod,
      breakfast_included:         breakfast,
      guest_count:                parseInt(guestCount) || 1,
      breakfast_price_per_person: parseFloat(bfstPrice) || 10,
      room_service_total:         parseFloat(svcTotal) || 0,
      notes:                      notes || null,
      created_by:                 user.user?.email ?? null,
      created_at:                 now,
    }

    const { data: inv, error: err } = await supabase
      .from('invoices').insert(payload).select('*').single()
    if (err) { setError(err.message); setSaving(false); return }
    onCreated(inv as Invoice)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Neue Rechnung erstellen</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        {step === 'search' ? (
          <div className="p-6">
            <p className="text-sm text-slate-500 mb-4">Gast suchen um Felder automatisch auszufüllen, oder direkt Eingabe überspringen.</p>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={e => handleQueryChange(e.target.value)}
                placeholder="Gastname oder Zimmernummer…"
                className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
            </div>

            {results.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                {results.map((r, i) => (
                  <button key={r.id}
                    onClick={() => prefill(r)}
                    className={cn('w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center justify-between',
                      i > 0 && 'border-t border-slate-100')}>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{r.guest_name}</p>
                      <p className="text-xs text-slate-400">
                        Zi. {r.rooms.room_number} · {r.rooms.name} ·{' '}
                        {format(new Date(r.checkin_at), 'dd.MM.')}–{format(new Date(r.checkout_at), 'dd.MM.yyyy')}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}

            <button onClick={() => setStep('form')}
              className="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
              Ohne Reservierung manuell eingeben →
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Gastname"><input value={guestName} onChange={e => setGuestName(e.target.value)} className={inp} /></Field>
              <Field label="E-Mail"><input value={guestEmail} onChange={e => setGuestEmail(e.target.value)} className={inp} /></Field>
            </div>
            <Field label="Adresse">
              <textarea rows={3} value={guestAddress} onChange={e => setGuestAddress(e.target.value)}
                className={cn(inp, 'resize-none')} placeholder="Straße 1&#10;12345 Stadt&#10;Deutschland" />
            </Field>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Field label="Zimmername"><input value={roomName} onChange={e => setRoomName(e.target.value)} className={inp} /></Field>
              </div>
              <Field label="Zimmer-Nr."><input value={roomNumber} onChange={e => setRoomNumber(e.target.value)} className={inp} /></Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Anreise"><input type="date" value={checkinAt} onChange={e => setCheckinAt(e.target.value)} className={inp} /></Field>
              <Field label="Abreise"><input type="date" value={checkoutAt} onChange={e => setCheckoutAt(e.target.value)} className={inp} /></Field>
              <Field label="Nächte"><input type="number" min={1} value={nights} onChange={e => setNights(e.target.value)} className={inp} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Preis Übernachtung (€)"><input type="number" step="0.01" value={totalPrice} onChange={e => setTotalPrice(e.target.value)} className={inp} /></Field>
              <Field label="Zahlungsart">
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className={inp}>
                  {PAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4 items-end">
              <div className="flex items-center gap-2 mt-5">
                <input type="checkbox" id="bfst2" checked={breakfast} onChange={e => setBreakfast(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600" />
                <label htmlFor="bfst2" className="text-sm font-medium text-slate-700 cursor-pointer">Frühstück</label>
              </div>
              <Field label="Personen"><input type="number" min={1} value={guestCount} onChange={e => setGuestCount(e.target.value)} className={inp} disabled={!breakfast} /></Field>
              <Field label="€ / Person"><input type="number" step="0.01" value={bfstPrice} onChange={e => setBfstPrice(e.target.value)} className={inp} disabled={!breakfast} /></Field>
            </div>
            <Field label="Zimmerservice Gesamt (€)">
              <input type="number" step="0.01" value={svcTotal} onChange={e => setSvcTotal(e.target.value)} className={inp} />
            </Field>
            <Field label="Notizen">
              <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={cn(inp, 'resize-none')} />
            </Field>
          </div>
        )}

        {step === 'form' && (
          <div className="flex justify-between gap-3 px-6 py-4 border-t border-slate-200">
            <button onClick={() => setStep('search')} className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
              ← Zurück
            </button>
            <div className="flex gap-3">
              <button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Abbrechen
              </button>
              <button onClick={handleCreate} disabled={saving || !guestName || !roomNumber}
                className="rounded-xl bg-blue-600 text-white px-5 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Erstelle…' : 'Rechnung erstellen'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const supabase       = createClient()
  const { isAdmin }    = useAdmin()

  const [invoices,     setInvoices]     = useState<Invoice[]>([])
  const [loading,      setLoading]      = useState(true)
  const [nextNumber,   setNextNumber]   = useState<number>(1)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsVal,  setSettingsVal]  = useState('')
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState<string | null>(null)
  const [confirmDel,   setConfirmDel]   = useState<string | null>(null)
  const [editInv,      setEditInv]      = useState<Invoice | null>(null)
  const [showCreate,   setShowCreate]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: inv }, { data: settings }] = await Promise.all([
      supabase.from('invoices').select('*').order('invoice_number', { ascending: false }),
      supabase.from('invoice_settings').select('next_number').eq('id', 1).single(),
    ])
    setInvoices((inv ?? []) as Invoice[])
    if (settings) setNextNumber(settings.next_number)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function saveSettings() {
    const num = parseInt(settingsVal)
    if (isNaN(num) || num < 1) return
    setSaving(true)
    await supabase.from('invoice_settings').update({
      next_number: num,
      updated_by:  (await supabase.auth.getUser()).data.user?.email ?? null,
      updated_at:  new Date().toISOString(),
    }).eq('id', 1)
    setNextNumber(num)
    setShowSettings(false)
    setSaving(false)
  }

  async function handleDelete(inv: Invoice) {
    if (confirmDel !== inv.id) { setConfirmDel(inv.id); return }
    setDeleting(inv.id); setConfirmDel(null)
    await supabase.from('invoices').delete().eq('id', inv.id)
    const { data: remaining } = await supabase
      .from('invoices').select('invoice_number').order('invoice_number', { ascending: false }).limit(1).single()
    const newNext = remaining ? remaining.invoice_number + 1 : 1
    await supabase.from('invoice_settings').update({ next_number: newNext }).eq('id', 1)
    setInvoices(prev => prev.filter(i => i.id !== inv.id))
    setNextNumber(newNext)
    setDeleting(null)
  }

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-slate-500" />
            Rechnungen
          </h1>
          <p className="text-slate-500 mt-1">
            {invoices.length} Rechnung{invoices.length !== 1 ? 'en' : ''} ·
            Nächste Nr.: <span className="font-mono font-semibold">{fmtNum(nextNumber)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Neue Rechnung
          </button>
          {isAdmin && (
            <button
              onClick={() => { setSettingsVal(String(nextNumber)); setShowSettings(s => !s) }}
              className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Nr.-Einstellungen
            </button>
          )}
        </div>
      </div>

      {/* Admin: change starting number */}
      {showSettings && isAdmin && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4 flex-wrap">
          <Hash className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Nächste Rechnungsnummer setzen</p>
            <p className="text-xs text-amber-600 mt-0.5">Bestehende Rechnungen bleiben unverändert.</p>
          </div>
          <input type="number" min={1} value={settingsVal} onChange={e => setSettingsVal(e.target.value)}
            className="w-28 border border-amber-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
          <button onClick={saveSettings} disabled={saving}
            className="rounded-lg bg-amber-600 text-white px-4 py-1.5 text-sm font-semibold hover:bg-amber-700 disabled:opacity-50">
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
          <button onClick={() => setShowSettings(false)} className="text-amber-500 hover:text-amber-700 text-sm">Abbrechen</button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-20 text-slate-400 text-sm">Lädt…</div>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-16 text-center">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Noch keine Rechnungen erstellt.</p>
          <p className="text-slate-400 text-xs mt-1">Rechnungen können beim Auschecken oder manuell erstellt werden.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Nr.</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Gast</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Zimmer</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Abreise</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Zahlung</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Betrag</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Erstellt</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-slate-900">{fmtNum(inv.invoice_number, new Date(inv.created_at).getFullYear())}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 flex items-center gap-1.5">
                        {inv.guest_name}
                        {inv.early_departure && (
                          <span className="rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-xs font-semibold">Früh</span>
                        )}
                      </div>
                      {inv.guest_email && <div className="text-xs text-slate-400">{inv.guest_email}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="font-semibold">Zi. {inv.room_number}</span>
                      <span className="ml-1 text-xs text-slate-400 hidden sm:inline">{inv.room_name}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {format(new Date(inv.checkout_at), 'd. MMM yyyy', { locale: de })}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{PAY_LABELS[inv.payment_method] ?? inv.payment_method}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold text-slate-900">€{(inv.total_price + (inv.room_service_total ?? 0)).toFixed(2)}</span>
                      {inv.early_departure && inv.original_price != null && (
                        <div className="text-xs text-slate-400 line-through">€{inv.original_price.toFixed(2)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {format(new Date(inv.created_at), 'd. MMM yyyy', { locale: de })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/invoices/${inv.id}`} target="_blank"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                          <FileText className="w-3.5 h-3.5" /> PDF
                        </Link>
                        <button onClick={() => setEditInv(inv)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                          <Edit2 className="w-3.5 h-3.5" /> Bearbeiten
                        </button>
                        {isAdmin && (
                          confirmDel === inv.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleDelete(inv)} disabled={!!deleting}
                                className="rounded-lg bg-red-600 text-white px-2.5 py-1.5 text-xs font-semibold hover:bg-red-700 disabled:opacity-50">
                                {deleting === inv.id ? '…' : 'Löschen'}
                              </button>
                              <button onClick={() => setConfirmDel(null)}
                                className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                                Nein
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => handleDelete(inv)} disabled={!!deleting}
                              className="rounded-lg border border-red-200 text-red-500 px-2.5 py-1.5 text-xs font-medium hover:bg-red-50 disabled:opacity-50">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editInv && (
        <EditModal
          inv={editInv}
          isAdmin={isAdmin}
          onClose={() => setEditInv(null)}
          onSaved={updated => setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i))}
        />
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={inv => { setInvoices(prev => [inv, ...prev]); setNextNumber(inv.invoice_number + 1) }}
        />
      )}
    </div>
  )
}
