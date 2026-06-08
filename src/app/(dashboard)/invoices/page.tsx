'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient }  from '@/lib/supabase/client'
import { format }        from 'date-fns'
import { de }            from 'date-fns/locale'
import {
  FileText, Settings, ChevronRight, Hash, Trash2, Edit2,
  Plus, Search, X, Save, Loader2, Users, Calendar,
} from 'lucide-react'
import { useAdmin }      from '@/hooks/useAdmin'
import { cn }            from '@/lib/cn'
import Link              from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem {
  id: string
  description: string
  qty: number
  unit_price: number   // gross price per unit (VAT inclusive)
  vat_rate: 7 | 19
}

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
  child_count: number
  breakfast_price_per_person: number
  room_service_total: number
  line_items: LineItem[]
  room2_number: string | null
  room2_name: string | null
  room2_total_price: number | null
  room2_checkin_at: string | null
  room2_checkout_at: string | null
  room2_nights: number | null
  room2_guest_count: number | null
  discount: number
  room2_child_count: number | null
  salutation: string | null
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
  rooms: { name: string; room_number: string; room_types?: { name: string } }
}

interface Customer {
  id: string
  name: string
  email: string | null
  phone: string | null
  street: string | null
  postcode: string | null
  city: string | null
  country: string | null
}

interface Room {
  room_number: string
  name: string
  room_types: { name: string } | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAY_LABELS: Record<string, string> = {
  cash: 'Bar', ec_card: 'EC-Karte', credit_card: 'Kreditkarte',
  card_verified: 'Karte verifiziert', online: 'Online', unpaid: 'Ausstehend',
}
const PAY_OPTIONS = [
  { value: 'cash',         label: 'Bar' },
  { value: 'ec_card',      label: 'EC-Karte' },
  { value: 'credit_card',  label: 'Kreditkarte' },
  { value: 'card_verified', label: 'Karte verifiziert' },
  { value: 'online',       label: 'Online' },
]

function fmtNum(n: number, year?: number) {
  const y = (year ?? new Date().getFullYear()).toString().slice(-2)
  return `R${y}_${String(n).padStart(3, '0')}`
}

// ── Datetime helpers ──────────────────────────────────────────────────────────

/** Convert an ISO string (UTC) to a local datetime-local string */
function toLocalDatetime(isoStr: string): string {
  const d = new Date(isoStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Today at a given hour, formatted for datetime-local input */
function todayAt(hour: number): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`
}

/** Tomorrow at a given hour, formatted for datetime-local input */
function tomorrowAt(hour: number): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`
}

// ── Address helpers ───────────────────────────────────────────────────────────

function buildAddress(r: Reservation): string {
  const parts = [
    r.guest_street,
    [r.guest_postcode, r.guest_city].filter(Boolean).join(' '),
    r.guest_country,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('\n') : (r.billing_address ?? '')
}

function buildCustomerAddress(c: Customer): string {
  const parts = [
    c.street,
    [c.postcode, c.city].filter(Boolean).join(' '),
    c.country,
  ].filter(Boolean)
  return parts.join('\n')
}

// ── Field + shared input ──────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}
const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

// ── Line Items Editor ─────────────────────────────────────────────────────────

function LineItemsEditor({ items, onChange }: { items: LineItem[]; onChange: (items: LineItem[]) => void }) {
  function addItem() {
    const id = Math.random().toString(36).slice(2, 10)
    onChange([...items, { id, description: '', qty: 1, unit_price: 0, vat_rate: 19 }])
  }
  function removeItem(id: string) {
    onChange(items.filter(i => i.id !== id))
  }
  function updateItem(id: string, field: keyof LineItem, value: any) {
    onChange(items.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  const si = 'border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 w-full bg-white'

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
        Zusätzliche Positionen
      </label>
      {items.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden mb-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="text-left px-3 py-2 font-semibold">Beschreibung</th>
                <th className="px-2 py-2 font-semibold w-16 text-center">Anz.</th>
                <th className="px-2 py-2 font-semibold w-28 text-right">€/Einheit</th>
                <th className="px-2 py-2 font-semibold w-20 text-center">MwSt.</th>
                <th className="px-2 py-2 font-semibold w-24 text-right">Gesamt</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(item => (
                <tr key={item.id} className="bg-white">
                  <td className="px-2 py-1.5">
                    <input value={item.description}
                      onChange={e => updateItem(item.id, 'description', e.target.value)}
                      className={si} placeholder="z.B. Stadtsteuer, Parkgebühr …" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" min={0.01} step="0.01" value={item.qty}
                      onChange={e => updateItem(item.id, 'qty', parseFloat(e.target.value) || 1)}
                      className={cn(si, 'text-center')} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" step="0.01" min={0} value={item.unit_price}
                      onChange={e => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                      className={cn(si, 'text-right')} />
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={item.vat_rate}
                      onChange={e => updateItem(item.id, 'vat_rate', parseInt(e.target.value) as 7 | 19)}
                      className={cn(si, 'text-center')}>
                      <option value={7}>7 %</option>
                      <option value={19}>19 %</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-700 font-semibold">
                    {(item.qty * item.unit_price).toFixed(2)} €
                  </td>
                  <td className="px-1 py-1.5 text-center">
                    <button onClick={() => removeItem(item.id)}
                      className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button type="button" onClick={addItem}
        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors py-1">
        <Plus className="w-3.5 h-3.5" />
        Position hinzufügen
      </button>
    </div>
  )
}

// ── Edit Invoice Modal ────────────────────────────────────────────────────────

function EditModal({
  inv, isAdmin, onClose, onSaved,
}: {
  inv: Invoice; isAdmin: boolean; onClose: () => void; onSaved: (updated: Invoice) => void
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const [rooms,  setRooms]  = useState<Room[]>([])

  const [salutation,   setSalutation]   = useState(inv.salutation ?? '')
  const [guestName,    setGuestName]    = useState(inv.guest_name)
  const [guestEmail,   setGuestEmail]   = useState(inv.guest_email ?? '')
  const [guestAddress, setGuestAddress] = useState(inv.guest_address ?? '')
  const [roomName,     setRoomName]     = useState(inv.room_name)
  const [roomNumber,   setRoomNumber]   = useState(inv.room_number)
  const [checkinAt,    setCheckinAt]    = useState(toLocalDatetime(inv.checkin_at))
  const [checkoutAt,   setCheckoutAt]   = useState(toLocalDatetime(inv.checkout_at))
  const [nights,       setNights]       = useState(String(inv.nights))
  const [totalPrice,   setTotalPrice]   = useState(String(inv.total_price))
  const [payMethod,    setPayMethod]    = useState(inv.payment_method)
  const [breakfast,    setBreakfast]    = useState(inv.breakfast_included)
  const [guestCount,   setGuestCount]   = useState(String(inv.guest_count ?? 1))
  const [childCount,   setChildCount]   = useState(String(inv.child_count ?? 0))
  const [bfstPrice,    setBfstPrice]    = useState(String(inv.breakfast_price_per_person ?? 10))
  const [svcTotal,     setSvcTotal]     = useState(String(inv.room_service_total ?? 0))
  const [discount,     setDiscount]     = useState(String(inv.discount ?? 0))
  const [notes,        setNotes]        = useState(inv.notes ?? '')
  const [invoiceNum,   setInvoiceNum]   = useState(String(inv.invoice_number))
  const [lineItems,       setLineItems]       = useState<LineItem[]>(
    Array.isArray(inv.line_items) ? inv.line_items : []
  )
  const [hasRoom2,         setHasRoom2]         = useState(!!(inv.room2_number))
  const [room2Number,      setRoom2Number]      = useState(inv.room2_number ?? '')
  const [room2Name,        setRoom2Name]        = useState(inv.room2_name ?? '')
  const [room2TotalPrice,  setRoom2TotalPrice]  = useState(String(inv.room2_total_price ?? ''))
  const [room2CheckinAt,   setRoom2CheckinAt]   = useState(inv.room2_checkin_at  ? toLocalDatetime(inv.room2_checkin_at)  : '')
  const [room2CheckoutAt,  setRoom2CheckoutAt]  = useState(inv.room2_checkout_at ? toLocalDatetime(inv.room2_checkout_at) : '')
  const [room2Nights,      setRoom2Nights]      = useState(String(inv.room2_nights ?? ''))
  const [room2GuestCount,  setRoom2GuestCount]  = useState(String(inv.room2_guest_count ?? 1))
  const [room2ChildCount2, setRoom2ChildCount2] = useState(String(inv.room2_child_count ?? 0))

  // Load rooms for dropdown
  useEffect(() => {
    ;(supabase as any)
      .from('rooms')
      .select('room_number, name, room_types(name)')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }: { data: Room[] | null }) => { if (data) setRooms(data) })
  }, [])

  function handleRoomSelect(selectedNumber: string) {
    const room = rooms.find(r => r.room_number === selectedNumber)
    if (room) {
      setRoomNumber(room.room_number)
      setRoomName(room.room_types?.name ?? room.name)
    } else {
      setRoomNumber(selectedNumber)
    }
  }

  function handleRoom2Select(selectedNumber: string) {
    const room = rooms.find(r => r.room_number === selectedNumber)
    if (room) {
      setRoom2Number(room.room_number)
      setRoom2Name(room.room_types?.name ?? room.name)
    } else {
      setRoom2Number(selectedNumber)
      setRoom2Name('')
    }
  }

  async function handleSave() {
    setSaving(true); setError(null)
    const payload: Record<string, unknown> = {
      salutation:                 salutation || null,
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
      child_count:                parseInt(childCount) || 0,
      breakfast_price_per_person: parseFloat(bfstPrice) || 10,
      room_service_total:         parseFloat(svcTotal) || 0,
      discount:                   parseFloat(discount) || 0,
      notes:                      notes || null,
      line_items:                 lineItems,
      room2_number:               hasRoom2 && room2Number      ? room2Number                           : null,
      room2_name:                 hasRoom2 && room2Name        ? room2Name                             : null,
      room2_total_price:          hasRoom2 && room2TotalPrice  ? parseFloat(room2TotalPrice) || null   : null,
      room2_checkin_at:           hasRoom2 && room2CheckinAt   ? new Date(room2CheckinAt).toISOString()  : null,
      room2_checkout_at:          hasRoom2 && room2CheckoutAt  ? new Date(room2CheckoutAt).toISOString() : null,
      room2_nights:               hasRoom2 && room2Nights      ? parseInt(room2Nights) || null           : null,
      room2_guest_count:          hasRoom2                     ? parseInt(room2GuestCount)  || 1         : null,
      room2_child_count:          hasRoom2                     ? parseInt(room2ChildCount2) || 0         : null,
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
          <h2 className="text-lg font-bold text-slate-900">
            Rechnung bearbeiten · {fmtNum(inv.invoice_number, new Date(inv.created_at).getFullYear())}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          {isAdmin && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <Field label="Rechnungsnummer (nur Admin)">
                <input type="number" value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} className={inp} />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <Field label="Anrede">
              <select value={salutation} onChange={e => setSalutation(e.target.value)} className={inp}>
                <option value="">—</option>
                <option value="Herr">Herr</option>
                <option value="Frau">Frau</option>
              </select>
            </Field>
            <Field label="Gastname">
              <input value={guestName} onChange={e => setGuestName(e.target.value)} className={inp} />
            </Field>
            <Field label="E-Mail">
              <input value={guestEmail} onChange={e => setGuestEmail(e.target.value)} className={inp} />
            </Field>
          </div>
          <Field label="Adresse">
            <textarea rows={3} value={guestAddress} onChange={e => setGuestAddress(e.target.value)}
              className={cn(inp, 'resize-none')} placeholder="Straße 1&#10;12345 Stadt&#10;Deutschland" />
          </Field>

          {/* Room dropdown — full width, no separate type input needed */}
          <Field label="Zimmer auswählen">
            <select
              value={roomNumber}
              onChange={e => handleRoomSelect(e.target.value)}
              className={inp}
            >
              <option value="">— Zimmer wählen —</option>
              {rooms.map(r => (
                <option key={r.room_number} value={r.room_number}>
                  Zimmer {r.room_number} – {r.room_types?.name ?? r.name}
                </option>
              ))}
            </select>
          </Field>

          {/* Second room */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="edit-room2" checked={hasRoom2}
                onChange={e => {
                  const checked = e.target.checked
                  setHasRoom2(checked)
                  if (checked) {
                    if (!room2CheckinAt)  setRoom2CheckinAt(checkinAt)
                    if (!room2CheckoutAt) setRoom2CheckoutAt(checkoutAt)
                    if (!room2Nights)     setRoom2Nights(nights)
                  } else {
                    setRoom2Number(''); setRoom2Name(''); setRoom2TotalPrice('')
                    setRoom2CheckinAt(''); setRoom2CheckoutAt(''); setRoom2Nights('')
                    setRoom2GuestCount('1'); setRoom2ChildCount2('0')
                  }
                }}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <label htmlFor="edit-room2" className="text-sm font-medium text-slate-700 cursor-pointer">
                Zweites Zimmer hinzufügen
              </label>
            </div>
            {hasRoom2 && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Zweites Zimmer">
                    <select value={room2Number} onChange={e => handleRoom2Select(e.target.value)} className={inp}>
                      <option value="">— Zimmer wählen —</option>
                      {rooms.map(r => (
                        <option key={r.room_number} value={r.room_number}>
                          Zimmer {r.room_number} – {r.room_types?.name ?? r.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Preis Zweites Zimmer gesamt (€)">
                    <input type="number" step="0.01" min={0} value={room2TotalPrice}
                      onChange={e => setRoom2TotalPrice(e.target.value)} className={inp}
                      placeholder="z.B. 90.00" />
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Anreise (Zimmer 2)">
                    <input type="datetime-local" value={room2CheckinAt}
                      onChange={e => setRoom2CheckinAt(e.target.value)} className={inp} />
                  </Field>
                  <Field label="Abreise (Zimmer 2)">
                    <input type="datetime-local" value={room2CheckoutAt}
                      onChange={e => setRoom2CheckoutAt(e.target.value)} className={inp} />
                  </Field>
                  <Field label="Nächte (Zimmer 2)">
                    <input type="number" min={1} value={room2Nights}
                      onChange={e => setRoom2Nights(e.target.value)} className={inp} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Erwachsene (Zimmer 2)">
                    <input type="number" min={1} value={room2GuestCount}
                      onChange={e => setRoom2GuestCount(e.target.value)} className={inp} />
                  </Field>
                  <Field label="Kinder (Zimmer 2)">
                    <input type="number" min={0} value={room2ChildCount2}
                      onChange={e => setRoom2ChildCount2(e.target.value)} className={inp} />
                  </Field>
                </div>
              </div>
            )}
          </div>

          {/* Dates with time */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Anreise">
              <input type="datetime-local" value={checkinAt} onChange={e => setCheckinAt(e.target.value)} className={inp} />
            </Field>
            <Field label="Abreise">
              <input type="datetime-local" value={checkoutAt} onChange={e => setCheckoutAt(e.target.value)} className={inp} />
            </Field>
            <Field label="Nächte">
              <input type="number" min={1} value={nights} onChange={e => setNights(e.target.value)} className={inp} />
            </Field>
          </div>

          {/* Guest counts — always editable */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Erwachsene">
              <input type="number" min={1} value={guestCount} onChange={e => setGuestCount(e.target.value)} className={inp} />
            </Field>
            <Field label="Kinder">
              <input type="number" min={0} value={childCount} onChange={e => setChildCount(e.target.value)} className={inp} />
            </Field>
          </div>

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
          <div className="grid grid-cols-2 gap-4 items-end">
            <div className="flex items-center gap-2 mt-5">
              <input type="checkbox" id="edit-bfst" checked={breakfast} onChange={e => setBreakfast(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <label htmlFor="edit-bfst" className="text-sm font-medium text-slate-700 cursor-pointer">Frühstück inkl.</label>
            </div>
            <Field label="Frühstück / Person (€)">
              <input type="number" step="0.01" value={bfstPrice} onChange={e => setBfstPrice(e.target.value)} className={inp} disabled={!breakfast} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Zimmerservice Gesamt (€)">
              <input type="number" step="0.01" value={svcTotal} onChange={e => setSvcTotal(e.target.value)} className={inp} />
            </Field>
            <Field label="Rabatt (€)">
              <input type="number" step="0.01" min={0} value={discount} onChange={e => setDiscount(e.target.value)}
                className={inp} placeholder="0.00" />
            </Field>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <LineItemsEditor items={lineItems} onChange={setLineItems} />
          </div>

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
  const supabase      = createClient()
  const [step,        setStep]        = useState<'search' | 'form'>('search')
  const [searchTab,   setSearchTab]   = useState<'reservation' | 'customer'>('reservation')
  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState<Reservation[]>([])
  const [custResults, setCustResults] = useState<Customer[]>([])
  const [searching,   setSearching]   = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [rooms,       setRooms]       = useState<Room[]>([])

  const [salutation,    setSalutation]    = useState('')
  const [guestName,     setGuestName]     = useState('')
  const [guestEmail,    setGuestEmail]    = useState('')
  const [guestAddress,  setGuestAddress]  = useState('')
  const [roomName,      setRoomName]      = useState('')
  const [roomNumber,    setRoomNumber]    = useState('')
  const [checkinAt,     setCheckinAt]     = useState(todayAt(14))
  const [checkoutAt,    setCheckoutAt]    = useState(tomorrowAt(11))
  const [nights,        setNights]        = useState('1')
  const [totalPrice,    setTotalPrice]    = useState('')
  const [payMethod,     setPayMethod]     = useState('cash')
  const [breakfast,     setBreakfast]     = useState(false)
  const [guestCount,    setGuestCount]    = useState('1')
  const [childCount,    setChildCount]    = useState('0')
  const [bfstPrice,     setBfstPrice]     = useState('10')
  const [svcTotal,      setSvcTotal]      = useState('0')
  const [discount,      setDiscount]      = useState('0')
  const [notes,         setNotes]         = useState('')
  const [lineItems,     setLineItems]     = useState<LineItem[]>([])
  const [reservationId, setReservationId] = useState<string | null>(null)
  const [hasRoom2,         setHasRoom2]         = useState(false)
  const [room2Number,      setRoom2Number]      = useState('')
  const [room2Name,        setRoom2Name]        = useState('')
  const [room2TotalPrice,  setRoom2TotalPrice]  = useState('')
  const [room2CheckinAt,   setRoom2CheckinAt]   = useState('')
  const [room2CheckoutAt,  setRoom2CheckoutAt]  = useState('')
  const [room2Nights,      setRoom2Nights]      = useState('')
  const [room2GuestCount,  setRoom2GuestCount]  = useState('1')
  const [room2ChildCount2, setRoom2ChildCount2] = useState('0')

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load rooms for dropdown
  useEffect(() => {
    ;(supabase as any)
      .from('rooms')
      .select('room_number, name, room_types(name)')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }: { data: Room[] | null }) => { if (data) setRooms(data) })
  }, [])

  function doSearch(v: string, tab: 'reservation' | 'customer') {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!v.trim()) { setResults([]); setCustResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      if (tab === 'reservation') {
        const { data } = await supabase
          .from('reservations')
          .select('id, guest_name, guest_email, guest_count, room_id, checkin_at, checkout_at, total_price, payment_method, breakfast_included, billing_address, guest_street, guest_postcode, guest_city, guest_country, notes, rooms(name, room_number, room_types(name))')
          .ilike('guest_name', `%${v}%`)
          .is('deleted_at', null)
          .order('checkin_at', { ascending: false })
          .limit(12)
        setResults((data ?? []) as Reservation[])
      } else {
        const { data } = await (supabase as any)
          .from('customers')
          .select('id, name, email, phone, street, postcode, city, country')
          .ilike('name', `%${v}%`)
          .limit(12)
        setCustResults((data ?? []) as Customer[])
      }
      setSearching(false)
    }, 300)
  }

  function handleQueryChange(v: string) {
    setQuery(v)
    doSearch(v, searchTab)
  }

  function switchTab(tab: 'reservation' | 'customer') {
    setSearchTab(tab)
    setQuery('')
    setResults([])
    setCustResults([])
  }

  function handleRoomSelect(selectedNumber: string) {
    const room = rooms.find(r => r.room_number === selectedNumber)
    if (room) {
      setRoomNumber(room.room_number)
      setRoomName(room.room_types?.name ?? room.name)
    } else {
      setRoomNumber(selectedNumber)
    }
  }

  function handleRoom2Select(selectedNumber: string) {
    const room = rooms.find(r => r.room_number === selectedNumber)
    if (room) {
      setRoom2Number(room.room_number)
      setRoom2Name(room.room_types?.name ?? room.name)
    } else {
      setRoom2Number(selectedNumber)
      setRoom2Name('')
    }
  }

  // ── Prefill from reservation ──────────────────────────────────────────────

  async function prefill(r: Reservation) {
    const n = Math.max(1, Math.round(
      (new Date(r.checkout_at).getTime() - new Date(r.checkin_at).getTime()) / 86400000
    ))
    let address = buildAddress(r)
    let email   = r.guest_email ?? ''

    // If reservation is missing address parts, look up in customers table
    if (!r.guest_postcode && !r.guest_city) {
      const { data: cust } = await (supabase as any)
        .from('customers')
        .select('street, postcode, city, country, email')
        .ilike('name', r.guest_name)
        .maybeSingle()
      if (cust) {
        const custAddr = buildCustomerAddress(cust as Customer)
        if (custAddr) address = custAddr
        if (!email && cust.email) email = cust.email
      }
    }

    // Room type name (e.g. "Doppelzimmer"), fallback to room name
    const roomTypeName = (r.rooms as any).room_types?.name ?? (r.rooms as any).name

    setReservationId(r.id)
    setGuestName(r.guest_name)
    setGuestEmail(email)
    setGuestAddress(address)
    setRoomName(roomTypeName)
    setRoomNumber((r.rooms as any).room_number)
    setCheckinAt(toLocalDatetime(r.checkin_at))
    setCheckoutAt(toLocalDatetime(r.checkout_at))
    setNights(String(n))
    setTotalPrice(String(r.total_price ?? ''))
    setPayMethod(r.payment_method)
    setBreakfast(r.breakfast_included)
    setGuestCount(String(r.guest_count))
    setNotes(r.notes ?? '')
    setStep('form')
  }

  // ── Prefill from customer record ──────────────────────────────────────────

  function prefillFromCustomer(c: Customer) {
    setReservationId(null)
    setGuestName(c.name)
    setGuestEmail(c.email ?? '')
    setGuestAddress(buildCustomerAddress(c))
    setStep('form')
  }

  // ── Create invoice ────────────────────────────────────────────────────────

  async function handleCreate() {
    setSaving(true); setError(null)
    const { data: numData, error: numErr } = await (supabase as any).rpc('get_next_invoice_number')
    if (numErr) { setError('Rechnungsnummer konnte nicht generiert werden.'); setSaving(false); return }

    const { data: user } = await supabase.auth.getUser()
    const payload: Record<string, unknown> = {
      invoice_number:             numData as number,
      reservation_id:             reservationId,
      salutation:                 salutation || null,
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
      child_count:                parseInt(childCount) || 0,
      breakfast_price_per_person: parseFloat(bfstPrice) || 10,
      room_service_total:         parseFloat(svcTotal) || 0,
      discount:                   parseFloat(discount) || 0,
      notes:                      notes || null,
      line_items:                 lineItems,
      room2_number:               hasRoom2 && room2Number      ? room2Number                           : null,
      room2_name:                 hasRoom2 && room2Name        ? room2Name                             : null,
      room2_total_price:          hasRoom2 && room2TotalPrice  ? parseFloat(room2TotalPrice) || null   : null,
      room2_checkin_at:           hasRoom2 && room2CheckinAt   ? new Date(room2CheckinAt).toISOString()  : null,
      room2_checkout_at:          hasRoom2 && room2CheckoutAt  ? new Date(room2CheckoutAt).toISOString() : null,
      room2_nights:               hasRoom2 && room2Nights      ? parseInt(room2Nights) || null           : null,
      room2_guest_count:          hasRoom2                     ? parseInt(room2GuestCount)  || 1         : null,
      room2_child_count:          hasRoom2                     ? parseInt(room2ChildCount2) || 0         : null,
      created_by:                 user.user?.email ?? null,
      created_at:                 new Date().toISOString(),
    }

    const { data: inv, error: err } = await supabase
      .from('invoices').insert(payload).select('*').single()
    if (err) { setError(err.message); setSaving(false); return }
    onCreated(inv as Invoice)
    onClose()
  }

  // ── Render ────────────────────────────────────────────────────────────────

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
            <p className="text-sm text-slate-500 mb-4">
              Gast oder Reservierung suchen um Felder automatisch auszufüllen — oder direkt manuell eingeben.
            </p>

            {/* Search type tabs */}
            <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1">
              <button
                onClick={() => switchTab('reservation')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors',
                  searchTab === 'reservation'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}>
                <Calendar className="w-3.5 h-3.5" />
                Reservierung
              </button>
              <button
                onClick={() => switchTab('customer')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors',
                  searchTab === 'customer'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}>
                <Users className="w-3.5 h-3.5" />
                Kunden
              </button>
            </div>

            {/* Search input */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={e => handleQueryChange(e.target.value)}
                placeholder={searchTab === 'reservation' ? 'Gastname suchen (alle Reservierungen)…' : 'Kundenname suchen…'}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
            </div>

            {/* Reservation results */}
            {searchTab === 'reservation' && results.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                {results.map((r, i) => (
                  <button key={r.id}
                    onClick={() => prefill(r)}
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center justify-between',
                      i > 0 && 'border-t border-slate-100',
                    )}>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{r.guest_name}</p>
                      <p className="text-xs text-slate-400">
                        Zi. {(r.rooms as any).room_number}
                        {(r.rooms as any).room_types?.name ? ` · ${(r.rooms as any).room_types.name}` : ` · ${(r.rooms as any).name}`}
                        {' · '}{format(new Date(r.checkin_at), 'dd.MM.')}–{format(new Date(r.checkout_at), 'dd.MM.yyyy')}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {/* Customer results */}
            {searchTab === 'customer' && custResults.length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
                {custResults.map((c, i) => (
                  <button key={c.id}
                    onClick={() => prefillFromCustomer(c)}
                    className={cn(
                      'w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center justify-between',
                      i > 0 && 'border-t border-slate-100',
                    )}>
                    <div>
                      <p className="font-medium text-slate-900 text-sm">{c.name}</p>
                      <p className="text-xs text-slate-400">
                        {[c.email, [c.postcode, c.city].filter(Boolean).join(' '), c.country].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}

            <button onClick={() => setStep('form')}
              className="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
              Ohne Vorlage manuell eingeben →
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

            <div className="grid grid-cols-3 gap-4">
              <Field label="Anrede">
                <select value={salutation} onChange={e => setSalutation(e.target.value)} className={inp}>
                  <option value="">—</option>
                  <option value="Herr">Herr</option>
                  <option value="Frau">Frau</option>
                </select>
              </Field>
              <Field label="Gastname">
                <input value={guestName} onChange={e => setGuestName(e.target.value)} className={inp} />
              </Field>
              <Field label="E-Mail">
                <input value={guestEmail} onChange={e => setGuestEmail(e.target.value)} className={inp} />
              </Field>
            </div>
            <Field label="Adresse">
              <textarea rows={3} value={guestAddress} onChange={e => setGuestAddress(e.target.value)}
                className={cn(inp, 'resize-none')} placeholder="Straße 1&#10;12345 Stadt&#10;Deutschland" />
            </Field>

            {/* Room dropdown — full width, no separate type input needed */}
            <Field label="Zimmer auswählen">
              <select
                value={roomNumber}
                onChange={e => handleRoomSelect(e.target.value)}
                className={inp}
              >
                <option value="">— Zimmer wählen —</option>
                {rooms.map(r => (
                  <option key={r.room_number} value={r.room_number}>
                    Zimmer {r.room_number} – {r.room_types?.name ?? r.name}
                  </option>
                ))}
              </select>
            </Field>

            {/* Second room */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="create-room2" checked={hasRoom2}
                  onChange={e => {
                    const checked = e.target.checked
                    setHasRoom2(checked)
                    if (checked) {
                      if (!room2CheckinAt)  setRoom2CheckinAt(checkinAt)
                      if (!room2CheckoutAt) setRoom2CheckoutAt(checkoutAt)
                      if (!room2Nights)     setRoom2Nights(nights)
                    } else {
                      setRoom2Number(''); setRoom2Name(''); setRoom2TotalPrice('')
                      setRoom2CheckinAt(''); setRoom2CheckoutAt(''); setRoom2Nights('')
                      setRoom2GuestCount('1'); setRoom2ChildCount2('0')
                    }
                  }}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <label htmlFor="create-room2" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Zweites Zimmer hinzufügen
                </label>
              </div>
              {hasRoom2 && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Zweites Zimmer">
                      <select value={room2Number} onChange={e => handleRoom2Select(e.target.value)} className={inp}>
                        <option value="">— Zimmer wählen —</option>
                        {rooms.map(r => (
                          <option key={r.room_number} value={r.room_number}>
                            Zimmer {r.room_number} – {r.room_types?.name ?? r.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Preis Zweites Zimmer gesamt (€)">
                      <input type="number" step="0.01" min={0} value={room2TotalPrice}
                        onChange={e => setRoom2TotalPrice(e.target.value)} className={inp}
                        placeholder="z.B. 90.00" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="Anreise (Zimmer 2)">
                      <input type="datetime-local" value={room2CheckinAt}
                        onChange={e => setRoom2CheckinAt(e.target.value)} className={inp} />
                    </Field>
                    <Field label="Abreise (Zimmer 2)">
                      <input type="datetime-local" value={room2CheckoutAt}
                        onChange={e => setRoom2CheckoutAt(e.target.value)} className={inp} />
                    </Field>
                    <Field label="Nächte (Zimmer 2)">
                      <input type="number" min={1} value={room2Nights}
                        onChange={e => setRoom2Nights(e.target.value)} className={inp} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Erwachsene (Zimmer 2)">
                      <input type="number" min={1} value={room2GuestCount}
                        onChange={e => setRoom2GuestCount(e.target.value)} className={inp} />
                    </Field>
                    <Field label="Kinder (Zimmer 2)">
                      <input type="number" min={0} value={room2ChildCount2}
                        onChange={e => setRoom2ChildCount2(e.target.value)} className={inp} />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            {/* Dates with time */}
            <div className="grid grid-cols-3 gap-4">
              <Field label="Anreise">
                <input type="datetime-local" value={checkinAt} onChange={e => setCheckinAt(e.target.value)} className={inp} />
              </Field>
              <Field label="Abreise">
                <input type="datetime-local" value={checkoutAt} onChange={e => setCheckoutAt(e.target.value)} className={inp} />
              </Field>
              <Field label="Nächte">
                <input type="number" min={1} value={nights} onChange={e => setNights(e.target.value)} className={inp} />
              </Field>
            </div>

            {/* Guest counts — always editable */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Erwachsene">
                <input type="number" min={1} value={guestCount} onChange={e => setGuestCount(e.target.value)} className={inp} />
              </Field>
              <Field label="Kinder">
                <input type="number" min={0} value={childCount} onChange={e => setChildCount(e.target.value)} className={inp} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Preis Übernachtung (€)">
                <input type="number" step="0.01" value={totalPrice} onChange={e => setTotalPrice(e.target.value)} className={inp} />
              </Field>
              <Field label="Zahlungsart">
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className={inp}>
                  {PAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </div>

            {/* Breakfast */}
            <div className="grid grid-cols-2 gap-4 items-end">
              <div className="flex items-center gap-2 mt-5">
                <input type="checkbox" id="create-bfst" checked={breakfast} onChange={e => setBreakfast(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600" />
                <label htmlFor="create-bfst" className="text-sm font-medium text-slate-700 cursor-pointer">Frühstück inkl.</label>
              </div>
              <Field label="€ / Person">
                <input type="number" step="0.01" value={bfstPrice} onChange={e => setBfstPrice(e.target.value)} className={inp} disabled={!breakfast} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Zimmerservice Gesamt (€)">
                <input type="number" step="0.01" value={svcTotal} onChange={e => setSvcTotal(e.target.value)} className={inp} />
              </Field>
              <Field label="Rabatt (€)">
                <input type="number" step="0.01" min={0} value={discount} onChange={e => setDiscount(e.target.value)}
                  className={inp} placeholder="0.00" />
              </Field>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <LineItemsEditor items={lineItems} onChange={setLineItems} />
            </div>

            <Field label="Notizen">
              <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className={cn(inp, 'resize-none')} />
            </Field>
          </div>
        )}

        {step === 'form' && (
          <div className="flex justify-between gap-3 px-6 py-4 border-t border-slate-200">
            <button onClick={() => setStep('search')}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
              ← Zurück
            </button>
            <div className="flex gap-3">
              <button onClick={onClose}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Abbrechen
              </button>
              <button onClick={handleCreate} disabled={saving || !guestName}
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
            className="flex items-center gap-2 rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" />
            Neue Rechnung
          </button>
          {isAdmin && (
            <button
              onClick={() => { setSettingsVal(String(nextNumber)); setShowSettings(s => !s) }}
              className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
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
                {invoices.map(inv => {
                  const customTotal = Array.isArray(inv.line_items)
                    ? inv.line_items.reduce((s, i) => s + i.qty * i.unit_price, 0)
                    : 0
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-slate-900">
                          {fmtNum(inv.invoice_number, new Date(inv.created_at).getFullYear())}
                        </span>
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
                        <span className="font-semibold text-slate-900">
                          €{(inv.total_price + (inv.room2_total_price ?? 0) + (inv.room_service_total ?? 0) + customTotal - (inv.discount ?? 0)).toFixed(2)}
                        </span>
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
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editInv && (
        <EditModal
          inv={editInv}
          isAdmin={isAdmin}
          onClose={() => setEditInv(null)}
          onSaved={updated => setInvoices(prev => prev.map(i => i.id === updated.id ? updated : i))}
        />
      )}

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={inv => { setInvoices(prev => [inv, ...prev]); setNextNumber(inv.invoice_number + 1) }}
        />
      )}
    </div>
  )
}
