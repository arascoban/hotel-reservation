'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'
import {
  buildCheckinTimestamp, buildCheckoutTimestamp, createReservationSafe, ReservationError,
} from '@/lib/reservations'
import { syncCustomerFromReservation, findOrCreateCustomer } from '@/lib/customers'
import { SALUTATIONS } from '@/lib/salutation'
import { eur } from '@/lib/deposit'
import DateInput from '@/components/ui/DateInput'
import CountryInput from '@/components/ui/CountryInput'
import PaymentsEditor from '@/components/Deposit/PaymentsEditor'
import DepositEditor, { type DepositState, EMPTY_DEPOSIT, depositPayload, depositFromRow } from '@/components/Deposit/DepositEditor'
import {
  X, Loader2, Save, Trash2, Plus, Users, BedDouble, AlertTriangle, Check, Ban, RotateCcw,
  Mail, Send, CheckCircle, AlertCircle, KeyRound,
} from 'lucide-react'
import type { PaymentMethod, PaymentStatus, ReservationSource } from '@/types/database'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GroupRow {
  id: string
  room_id: string
  guest_name: string
  guest_email: string | null
  guest_phone: string | null
  guest_street: string | null
  guest_postcode: string | null
  guest_city: string | null
  guest_country: string | null
  checkin_at: string
  checkout_at: string
  guest_count: number
  child_count: number | null
  total_price: number | null
  breakfast_included: boolean
  source: ReservationSource
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  notes: string | null
  internal_notes: string | null
  customer_id: string | null
  family_booking_id: string | null
  deposit_mode: string | null
  deposit_percent: number | null
  deposit_amount: number | null
  deposit_due_date: string | null
  rooms: { room_number: string; name: string; room_types?: { name: string; max_adults: number | null; max_children: number | null; max_capacity: number } } | null
}

/** Editable state for one room of the group. */
interface RoomEdit {
  id:       string
  label:    string
  typeName: string
  maxAdults:   number
  maxChildren: number
  maxCapacity: number
  adults:   number
  children: number
  price:    string
  checkin:  string
  checkout: string
  /** Marked for deletion on save. */
  remove:   boolean
}

interface FreeRoom { id: string; room_number: string; name: string; type_name: string; max_capacity: number }

const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'unpaid', label: 'Noch nicht bezahlt' }, { value: 'cash', label: 'Bargeld' },
  { value: 'ec_card', label: 'EC-Karte' }, { value: 'credit_card', label: 'Kreditkarte' },
  { value: 'online', label: 'Online' },
]
const PAYMENT_STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: 'unpaid', label: 'Unbezahlt' }, { value: 'deposit_paid', label: 'Anzahlung bezahlt' },
  { value: 'paid', label: 'Vollständig bezahlt' },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  groupId:   string
  onClose:   () => void
  onUpdated: () => void
}

/**
 * Edit a whole group booking at once.
 *
 * Guest details and the shared settings apply to every room; occupancy, price
 * and dates are per room. Rooms can be removed or added, which deletes or
 * creates the underlying reservation so the calendar stays correct.
 */
export default function GroupEditModal({ groupId, onClose, onUpdated }: Props) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [rows,    setRows]    = useState<GroupRow[]>([])

  // Shared guest fields
  const [salutation, setSalutation] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [street, setStreet] = useState('')
  const [postcode, setPostcode] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('unpaid')
  const [payStatus, setPayStatus] = useState<PaymentStatus>('unpaid')
  const [breakfast, setBreakfast] = useState(true)
  const [notes, setNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  // One requested deposit for the whole booking, stored on a single row
  const [deposit, setDeposit] = useState<DepositState>(EMPTY_DEPOSIT)

  // Per-room
  const [edits, setEdits] = useState<RoomEdit[]>([])

  // Adding rooms
  const [showAdd,   setShowAdd]   = useState(false)
  const [freeRooms, setFreeRooms] = useState<FreeRoom[]>([])
  const [loadingFree, setLoadingFree] = useState(false)

  // Whole-booking actions
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [acting,        setActing]        = useState(false)

  // Buchungsbestätigung
  const [mailStatus, setMailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [mailError,  setMailError]  = useState('')
  const [includeKeys, setIncludeKeys] = useState(true)
  const [confirmMail, setConfirmMail] = useState(false)

  // ── Load ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('reservations')
      .select('*, rooms(room_number, name, room_types(name, max_adults, max_children, max_capacity))')
      .eq('group_booking_id', groupId)
      .is('deleted_at', null)
      .order('checkin_at')

    const list = (data ?? []) as unknown as GroupRow[]
    setRows(list)

    if (list.length > 0) {
      const f = list[0]
      setSalutation((f as any).salutation ?? '')
      setGuestName(f.guest_name)
      setGuestEmail(f.guest_email ?? '')
      setGuestPhone(f.guest_phone ?? '')
      setStreet(f.guest_street ?? '')
      setPostcode(f.guest_postcode ?? '')
      setCity(f.guest_city ?? '')
      setCountry(f.guest_country ?? '')
      setPayMethod(f.payment_method)
      setPayStatus(f.payment_status)
      setBreakfast(f.breakfast_included)
      setNotes(f.notes ?? '')
      setInternalNotes(f.internal_notes ?? '')

      // The group's deposit lives on one row — find it wherever it sits.
      const carrier = list.find(r => r.deposit_amount != null || r.deposit_mode)
      setDeposit(carrier ? depositFromRow(carrier) : EMPTY_DEPOSIT)
    }

    setEdits(list.map(r => {
      const t = r.rooms?.room_types
      return {
        id:          r.id,
        label:       `Zimmer ${r.rooms?.room_number ?? '?'}`,
        typeName:    t?.name ?? r.rooms?.name ?? '',
        maxAdults:   t?.max_adults   ?? t?.max_capacity ?? 2,
        maxChildren: t?.max_children ?? 0,
        maxCapacity: t?.max_capacity ?? 2,
        adults:      (r.guest_count ?? 1) - (r.child_count ?? 0),
        children:    r.child_count ?? 0,
        price:       r.total_price != null ? String(r.total_price) : '',
        checkin:     r.checkin_at.slice(0, 10),
        checkout:    r.checkout_at.slice(0, 10),
        remove:      false,
      }
    }))
    setLoading(false)
  }, [supabase, groupId])

  useEffect(() => { load() }, [load])

  // ── Free rooms for adding ───────────────────────────────────────
  async function loadFreeRooms() {
    if (edits.length === 0) return
    setLoadingFree(true)
    setShowAdd(true)
    const first = edits[0]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc('get_available_rooms', {
      p_checkin_at:  buildCheckinTimestamp(first.checkin, '13:00'),
      p_checkout_at: buildCheckoutTimestamp(first.checkout, '12:00'),
      p_guest_count: 1,
    })
    setFreeRooms((data ?? []) as FreeRoom[])
    setLoadingFree(false)
  }

  function updateEdit(id: string, patch: Partial<RoomEdit>) {
    setEdits(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  /** Rooms added in this session, not yet persisted. */
  const [added, setAdded] = useState<(RoomEdit & { roomId: string })[]>([])

  function addRoom(room: FreeRoom) {
    const first = edits[0]
    setAdded(prev => [...prev, {
      id:          `new:${room.id}`,
      roomId:      room.id,
      label:       `Zimmer ${room.room_number}`,
      typeName:    room.type_name,
      maxAdults:   room.max_capacity,
      maxChildren: 0,
      maxCapacity: room.max_capacity,
      adults:      Math.min(2, room.max_capacity),
      children:    0,
      price:       '',
      checkin:     first?.checkin  ?? '',
      checkout:    first?.checkout ?? '',
      remove:      false,
    }])
    setShowAdd(false)
  }

  const allCancelled = rows.length > 0 && rows.every(r => (r as any).status === 'cancelled')

  const activeEdits = edits.filter(e => !e.remove)
  const allRooms    = [...activeEdits, ...added]
  const total       = allRooms.reduce((s, e) => s + (parseFloat(e.price) || 0), 0)
  const guests      = allRooms.reduce((s, e) => s + e.adults + e.children, 0)

  // ── Save ────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true); setError(null)

    if (allRooms.length === 0) {
      setError('Eine Gruppenbuchung braucht mindestens ein Zimmer.'); setSaving(false); return
    }
    for (const e of allRooms) {
      if (e.adults + e.children > e.maxCapacity) {
        setError(`${e.label}: max. ${e.maxCapacity} Personen.`); setSaving(false); return
      }
      if (!e.checkin || !e.checkout || e.checkout <= e.checkin) {
        setError(`${e.label}: Abreise muss nach der Anreise liegen.`); setSaving(false); return
      }
    }

    const billingAddress = [
      street.trim(), [postcode.trim(), city.trim()].filter(Boolean).join(' '), country.trim(),
    ].filter(Boolean).join('\n') || null

    try {
      // Guest details are shared, so they go to the linked customer too.
      const custId = rows[0]?.customer_id ?? null
      const guestFields = {
        name: guestName, salutation, email: guestEmail, phone: guestPhone,
        street, postcode, city, country,
      }
      if (custId) await syncCustomerFromReservation(supabase, custId, guestFields)

      const shared = {
        guest_name:      guestName,
        salutation:      salutation || null,
        guest_email:     guestEmail || null,
        guest_phone:     guestPhone || null,
        guest_street:    street   || null,
        guest_postcode:  postcode || null,
        guest_city:      city     || null,
        guest_country:   country  || null,
        billing_address: billingAddress,
        payment_method:  payMethod,
        payment_status:  payStatus,
        breakfast_included: breakfast,
        notes:           notes || null,
        internal_notes:  internalNotes || null,
      }

      // The deposit belongs to the booking, not to a room: keep it on the
      // first remaining reservation and clear it everywhere else so it can
      // never be counted twice.
      const { deposit_paid_amount, deposit_paid_at, deposit_paid_method, ...groupDeposit } =
        depositPayload(deposit, total)
      const clearedDeposit = {
        deposit_mode: null, deposit_percent: null,
        deposit_amount: null, deposit_due_date: null,
      }
      const depositCarrierId = activeEdits[0]?.id ?? null

      // 1. Rooms removed from the group
      for (const e of edits.filter(x => x.remove)) {
        await supabase.from('reservations').delete().eq('id', e.id)
      }

      // 2. Existing rooms
      for (const e of activeEdits) {
        await supabase.from('reservations').update({
          ...shared,
          ...(e.id === depositCarrierId ? groupDeposit : clearedDeposit),
          checkin_at:  buildCheckinTimestamp(e.checkin, '13:00'),
          checkout_at: buildCheckoutTimestamp(e.checkout, '12:00'),
          guest_count: e.adults + e.children,
          child_count: e.children,
          total_price: parseFloat(e.price) || null,
        }).eq('id', e.id)
      }

      // 3. Newly added rooms join the same group
      for (const a of added) {
        const newId = await createReservationSafe(supabase, {
          guest_name:  guestName,
          guest_email: guestEmail || undefined,
          guest_phone: guestPhone || undefined,
          room_id:     a.roomId,
          checkin_at:  buildCheckinTimestamp(a.checkin, '13:00'),
          checkout_at: buildCheckoutTimestamp(a.checkout, '12:00'),
          guest_count: a.adults + a.children,
          breakfast_included: breakfast,
          payment_method: payMethod,
          payment_status: payStatus,
          total_price: parseFloat(a.price) || undefined,
          notes: notes || undefined,
        })
        await supabase.from('reservations').update({
          ...shared,
          ...clearedDeposit,
          group_booking_id: groupId,
          customer_id:      custId ?? await findOrCreateCustomer(supabase, guestFields),
          child_count:      a.children,
        }).eq('id', newId)
      }

      onUpdated()
      onClose()
    } catch (err) {
      setError(err instanceof ReservationError
        ? err.message
        : 'Änderungen konnten nicht gespeichert werden.')
      setSaving(false)
    }
  }

  /**
   * Cancel or reinstate the whole booking. Cancelling frees the rooms in the
   * calendar (the no-overlap constraint ignores cancelled rows) but keeps the
   * booking and its history.
   */
  async function toggleCancelGroup() {
    if (!allCancelled && !confirmCancel) { setConfirmCancel(true); return }
    setActing(true); setConfirmCancel(false)
    await supabase.from('reservations')
      .update({ status: allCancelled ? 'confirmed' : 'cancelled' })
      .eq('group_booking_id', groupId)
    setActing(false)
    onUpdated(); onClose()
  }

  /** Soft-delete every room of the booking — recoverable, unlike removing a
   *  single room, and invoices already issued keep their payments. */
  async function deleteGroup() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setActing(true); setConfirmDelete(false)
    await supabase.from('reservations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('group_booking_id', groupId)
    setActing(false)
    onUpdated(); onClose()
  }

  /**
   * Send the Buchungsbestätigung for the whole booking.
   *
   * It goes out against the first reservation; the API resolves the group and
   * lists every room, so one mail covers the booking. Unsaved edits are not
   * included — the guest gets what is stored.
   */
  async function sendConfirmation() {
    const target = rows[0]
    if (!target) return
    setConfirmMail(false)
    setMailStatus('sending'); setMailError('')
    try {
      const res = await fetch('/api/send-confirmation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reservationId: target.id, includeKeys }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? 'Fehler beim Senden')
      }
      setMailStatus('sent')
      setTimeout(() => setMailStatus('idle'), 5000)
    } catch (e) {
      setMailError(e instanceof Error ? e.message : 'Unbekannter Fehler')
      setMailStatus('error')
      setTimeout(() => setMailStatus('idle'), 7000)
    }
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4"
         onClick={onClose} role="dialog" aria-modal="true" aria-label="Gruppenbuchung bearbeiten">
      <div className="bg-white w-full sm:max-w-3xl h-[95vh] sm:h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-200 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" /> Gruppenbuchung bearbeiten
            </h2>
            <p className="text-xs text-slate-400">
              {allRooms.length} Zimmer · {guests} Person{guests !== 1 ? 'en' : ''} · {eur(total)}
            </p>
          </div>
          <button onClick={onClose} aria-label="Schließen"
            className="grid place-items-center w-10 h-10 rounded-xl text-slate-400 hover:bg-slate-100 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-5">
          {loading ? (
            <p className="py-10 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Lädt…
            </p>
          ) : (
            <>
              {/* Guest — applies to every room */}
              <section className="rounded-xl border border-slate-200 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Gast <span className="font-normal normal-case text-slate-400">(gilt für alle Zimmer)</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <select value={salutation} onChange={e => setSalutation(e.target.value)}
                    className={inp} aria-label="Anrede">
                    <option value="">Anrede</option>
                    {SALUTATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input value={guestName} onChange={e => setGuestName(e.target.value)}
                    className={inp} placeholder="Name / Firma" aria-label="Name" />
                  <input value={guestEmail} onChange={e => setGuestEmail(e.target.value)}
                    className={inp} placeholder="E-Mail" aria-label="E-Mail" />
                  <input value={guestPhone} onChange={e => setGuestPhone(e.target.value)}
                    className={inp} placeholder="Telefon" aria-label="Telefon" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <input value={street} onChange={e => setStreet(e.target.value)}
                    className={cn(inp, 'sm:col-span-2')} placeholder="Straße & Nr." aria-label="Straße" />
                  <input value={postcode} onChange={e => setPostcode(e.target.value)}
                    className={inp} placeholder="PLZ" aria-label="PLZ" />
                  <input value={city} onChange={e => setCity(e.target.value)}
                    className={inp} placeholder="Stadt" aria-label="Stadt" />
                  <div className="sm:col-span-2">
                    <CountryInput value={country} onChange={setCountry} className={inp} />
                  </div>
                </div>
              </section>

              {/* Rooms */}
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2">
                    <BedDouble className="w-4 h-4 text-slate-400" /> Zimmer
                  </h3>
                  <button type="button" onClick={loadFreeRooms}
                    className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                    <Plus className="w-3.5 h-3.5" /> Zimmer hinzufügen
                  </button>
                </div>

                {/* Add-room picker */}
                {showAdd && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                    {loadingFree ? (
                      <p className="text-xs text-slate-500 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verfügbare Zimmer…
                      </p>
                    ) : freeRooms.length === 0 ? (
                      <p className="text-xs text-slate-500">Keine freien Zimmer in diesem Zeitraum.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {freeRooms.map(r => (
                          <button key={r.id} type="button" onClick={() => addRoom(r)}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors">
                            <span className="block font-semibold text-xs text-slate-900">Zi. {r.room_number}</span>
                            <span className="block text-2xs text-slate-400 truncate">{r.type_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <button type="button" onClick={() => setShowAdd(false)}
                      className="mt-2 text-xs text-slate-500 hover:text-slate-700">Abbrechen</button>
                  </div>
                )}

                {[...edits, ...added].map(e => {
                  const isNew = e.id.startsWith('new:')
                  const over  = e.adults + e.children > e.maxCapacity
                  return (
                    <div key={e.id}
                      className={cn('rounded-xl border p-3 space-y-2.5',
                        e.remove ? 'border-red-200 bg-red-50/60 opacity-60'
                        : over    ? 'border-red-300 bg-red-50'
                        : isNew   ? 'border-green-300 bg-green-50/50'
                                  : 'border-slate-200 bg-slate-50')}>

                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                            {e.label}
                            {isNew && <span className="rounded-full bg-green-100 text-green-700 px-1.5 py-0.5 text-2xs font-semibold">Neu</span>}
                            {e.remove && <span className="rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-2xs font-semibold">Wird entfernt</span>}
                          </p>
                          <p className="text-2xs text-slate-400">
                            {e.typeName} · max. {e.maxAdults} Erw.
                            {e.maxChildren > 0 && ` + ${e.maxChildren} Ki.`}
                          </p>
                        </div>
                        {isNew ? (
                          <button type="button" onClick={() => setAdded(prev => prev.filter(a => a.id !== e.id))}
                            aria-label={`${e.label} entfernen`}
                            className="grid place-items-center w-9 h-9 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 flex-shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        ) : (
                          <button type="button" onClick={() => updateEdit(e.id, { remove: !e.remove })}
                            aria-label={e.remove ? 'Entfernen rückgängig' : `${e.label} entfernen`}
                            className={cn('grid place-items-center w-9 h-9 rounded-lg flex-shrink-0 transition-colors',
                              e.remove ? 'text-slate-500 hover:bg-slate-200' : 'text-slate-400 hover:bg-red-50 hover:text-red-500')}>
                            {e.remove ? <Check className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        )}
                      </div>

                      {!e.remove && (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <label className="block text-2xs text-slate-500 mb-1">Erwachsene</label>
                              <input type="number" min={1} max={e.maxAdults} value={e.adults}
                                onChange={ev => isNew
                                  ? setAdded(p => p.map(a => a.id === e.id ? { ...a, adults: Math.max(1, Number(ev.target.value)) } : a))
                                  : updateEdit(e.id, { adults: Math.max(1, Number(ev.target.value)) })}
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                              <label className="block text-2xs text-slate-500 mb-1">Kinder</label>
                              <input type="number" min={0} max={e.maxChildren} value={e.children}
                                disabled={e.maxChildren === 0}
                                onChange={ev => isNew
                                  ? setAdded(p => p.map(a => a.id === e.id ? { ...a, children: Math.max(0, Number(ev.target.value)) } : a))
                                  : updateEdit(e.id, { children: Math.max(0, Number(ev.target.value)) })}
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-2xs text-slate-500 mb-1">Preis gesamt (€)</label>
                              <input type="number" min={0} step="0.01" value={e.price}
                                onChange={ev => isNew
                                  ? setAdded(p => p.map(a => a.id === e.id ? { ...a, price: ev.target.value } : a))
                                  : updateEdit(e.id, { price: ev.target.value })}
                                placeholder="0.00"
                                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-2xs text-slate-500 mb-1">Anreise</label>
                              <DateInput value={e.checkin}
                                onChange={v => isNew
                                  ? setAdded(p => p.map(a => a.id === e.id ? { ...a, checkin: v } : a))
                                  : updateEdit(e.id, { checkin: v })} />
                            </div>
                            <div>
                              <label className="block text-2xs text-slate-500 mb-1">Abreise</label>
                              <DateInput value={e.checkout} min={e.checkin}
                                onChange={v => isNew
                                  ? setAdded(p => p.map(a => a.id === e.id ? { ...a, checkout: v } : a))
                                  : updateEdit(e.id, { checkout: v })} />
                            </div>
                          </div>

                          {over && (
                            <p className="flex items-center gap-1 text-xs text-red-600">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Max. {e.maxCapacity} Personen in diesem Zimmer.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </section>

              {/* Shared settings */}
              <section className="rounded-xl border border-slate-200 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Zahlung &amp; Notizen <span className="font-normal normal-case text-slate-400">(gilt für alle Zimmer)</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select value={payMethod} onChange={e => setPayMethod(e.target.value as PaymentMethod)}
                    className={inp} aria-label="Zahlungsmethode">
                    {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <select value={payStatus} onChange={e => setPayStatus(e.target.value as PaymentStatus)}
                    className={inp} aria-label="Zahlungsstatus">
                    {PAYMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={breakfast} onChange={e => setBreakfast(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-slate-700">Frühstück inklusive</span>
                </label>
                <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                  className={cn(inp, 'resize-none')} placeholder="Notizen (erscheint in E-Mail & Rechnung)" />
                <textarea rows={2} value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
                  className={cn(inp, 'resize-none')} placeholder="Interne Notizen" />
              </section>

              {/* Requested deposit for the whole booking — shown on the
                  Buchungsbestätigung. Received money is the ledger below. */}
              <DepositEditor
                value={deposit}
                onChange={setDeposit}
                total={total}
                hidePayment
              />

              {/* Payments for the whole group sit on its first reservation */}
              {rows[0] && (
                <PaymentsEditor reservationId={rows[0].id} total={total} onChanged={load} />
              )}

              {/* Buchungsbestätigung — one mail covering every room */}
              <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Buchungsbestätigung
                </h3>

                {!guestEmail ? (
                  <p className="text-xs text-amber-700">
                    Kein E-Mail hinterlegt — bitte oben eine Adresse eintragen und speichern.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-slate-600">
                      Geht an <strong>{guestEmail}</strong> und listet alle {allRooms.length} Zimmer
                      dieser Buchung in einer E-Mail.
                    </p>

                    <button type="button" onClick={() => setIncludeKeys(k => !k)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-xs font-medium transition-colors',
                        includeKeys
                          ? 'border-slate-300 bg-white text-slate-700'
                          : 'border-slate-200 bg-slate-100 text-slate-400',
                      )}>
                      <KeyRound className="w-3.5 h-3.5" />
                      {includeKeys ? 'Mit Schlüssel-Infos' : 'Ohne Schlüssel-Infos'}
                    </button>

                    {confirmMail ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button type="button" onClick={sendConfirmation}
                          disabled={mailStatus === 'sending'}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 text-white h-11 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                          <Send className="w-4 h-4" /> Jetzt an Gast senden
                        </button>
                        <button type="button" onClick={() => setConfirmMail(false)}
                          className="rounded-xl border border-slate-300 px-4 h-11 text-sm text-slate-600 hover:bg-slate-50">
                          Abbrechen
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmMail(true)}
                        disabled={mailStatus === 'sending'}
                        className={cn(
                          'w-full inline-flex items-center justify-center gap-2 rounded-xl h-11 text-sm font-semibold transition-colors disabled:opacity-60',
                          mailStatus === 'sent'  ? 'bg-green-100 text-green-700'
                          : mailStatus === 'error' ? 'bg-red-100 text-red-700'
                          : 'bg-blue-600 text-white hover:bg-blue-700',
                        )}>
                        {mailStatus === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" />
                          : mailStatus === 'sent'  ? <CheckCircle className="w-4 h-4" />
                          : mailStatus === 'error' ? <AlertCircle className="w-4 h-4" />
                          : <Mail className="w-4 h-4" />}
                        {mailStatus === 'sending' ? 'Sende…'
                          : mailStatus === 'sent'  ? 'Gesendet!'
                          : mailStatus === 'error' ? `Fehler: ${mailError.slice(0, 40)}`
                          : 'Buchungsbestätigung senden'}
                      </button>
                    )}

                    <p className="text-2xs text-slate-400">
                      Es werden die gespeicherten Daten gesendet — Änderungen oben bitte
                      vorher speichern.
                    </p>
                  </>
                )}
              </section>

              {/* Whole-booking actions */}
              <section className="rounded-xl border border-slate-200 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Gesamte Buchung
                </h3>

                {allCancelled && (
                  <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                    Diese Gruppenbuchung ist storniert — die Zimmer sind im Kalender wieder frei.
                  </p>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                  {/* Storno / reinstate */}
                  <button type="button" onClick={toggleCancelGroup} disabled={acting}
                    className={cn(
                      'flex-1 inline-flex items-center justify-center gap-2 rounded-xl h-11 text-sm font-medium transition-colors disabled:opacity-50',
                      allCancelled
                        ? 'border border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                        : confirmCancel
                          ? 'bg-amber-600 text-white hover:bg-amber-700'
                          : 'border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100',
                    )}>
                    {acting ? <Loader2 className="w-4 h-4 animate-spin" />
                      : allCancelled ? <RotateCcw className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                    {allCancelled ? 'Storno aufheben'
                      : confirmCancel ? `Wirklich stornieren? (${allRooms.length} Zimmer)`
                      : 'Buchung stornieren'}
                  </button>

                  {/* Soft delete */}
                  <button type="button" onClick={deleteGroup} disabled={acting}
                    className={cn(
                      'flex-1 inline-flex items-center justify-center gap-2 rounded-xl h-11 text-sm font-medium transition-colors disabled:opacity-50',
                      confirmDelete
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'border border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
                    )}>
                    {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {confirmDelete ? `Wirklich löschen? (${allRooms.length} Zimmer)` : 'Buchung löschen'}
                  </button>
                </div>

                {(confirmCancel || confirmDelete) && (
                  <button type="button"
                    onClick={() => { setConfirmCancel(false); setConfirmDelete(false) }}
                    className="w-full rounded-xl border border-slate-300 h-10 text-xs text-slate-600 hover:bg-slate-50">
                    Abbrechen
                  </button>
                )}

                <p className="text-2xs text-slate-400">
                  Stornieren behält die Buchung und gibt die Zimmer frei.
                  Löschen blendet sie aus — bereits erstellte Rechnungen und
                  erfasste Zahlungen bleiben unverändert.
                </p>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-t border-slate-200 flex-shrink-0">
          {error && (
            <p className="flex-1 text-xs text-red-600 min-w-0">{error}</p>
          )}
          <button onClick={onClose}
            className="ml-auto rounded-xl border border-slate-300 px-4 h-11 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Abbrechen
          </button>
          <button onClick={handleSave} disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 h-11 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}
