'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  buildCheckinTimestamp, buildCheckoutTimestamp, createReservationSafe, ReservationError,
} from '@/lib/reservations'
import type { ReservationSource, PaymentMethod, PaymentStatus } from '@/types/database'
import { cn } from '@/lib/cn'
import { findOrCreateCustomer } from '@/lib/customers'
import DateInput from '@/components/ui/DateInput'
import TimeInput from '@/components/ui/TimeInput'
import CountryInput from '@/components/ui/CountryInput'
import { eur } from '@/lib/deposit'
import {
  Search, Loader2, Users, Check, X, CalendarDays, BedDouble, Plus,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Customer {
  id: string; name: string; email: string | null; phone: string | null
  street: string | null; postcode: string | null; city: string | null; country: string | null
}

interface RoomOption {
  id: string
  room_number: string
  name: string
  type_name: string
  max_capacity: number
  base_price: number | null
}

/** One selected room inside the group. */
interface GroupRoom {
  roomId:      string
  adults:      number
  children:    number
  price:       string   // gross for the whole stay of this room
  /** Own dates instead of the shared range. */
  ownDates:    boolean
  checkin:     string
  checkout:    string
}

const SOURCES: { value: ReservationSource; label: string }[] = [
  { value: 'phone',   label: 'Telefon' },
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Laufkundschaft' },
  { value: 'other',   label: 'Sonstige' },
]
const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'unpaid',       label: 'Noch nicht bezahlt' },
  { value: 'cash',         label: 'Bargeld' },
  { value: 'ec_card',      label: 'EC-Karte' },
  { value: 'credit_card',  label: 'Kreditkarte' },
  { value: 'online',       label: 'Online' },
]
const PAYMENT_STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: 'unpaid',       label: 'Unbezahlt' },
  { value: 'deposit_paid', label: 'Anzahlung bezahlt' },
  { value: 'paid',         label: 'Vollständig bezahlt' },
]

const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function nightsBetween(a: string, b: string): number {
  if (!a || !b) return 0
  return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000))
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GroupReservationForm() {
  const router   = useRouter()
  const supabase = createClient()

  // ── Guest ───────────────────────────────────────────────────────
  const [custQuery,   setCustQuery]   = useState('')
  const [custResults, setCustResults] = useState<Customer[]>([])
  const [searching,   setSearching]   = useState(false)
  const [customerId,  setCustomerId]  = useState<string | null>(null)

  const [guestName,    setGuestName]    = useState('')
  const [guestEmail,   setGuestEmail]   = useState('')
  const [guestPhone,   setGuestPhone]   = useState('')
  const [guestStreet,  setGuestStreet]  = useState('')
  const [guestPostcode, setGuestPostcode] = useState('')
  const [guestCity,    setGuestCity]    = useState('')
  const [guestCountry, setGuestCountry] = useState('')

  // ── Shared stay ─────────────────────────────────────────────────
  const [checkinDate,  setCheckinDate]  = useState('')
  const [checkoutDate, setCheckoutDate] = useState('')
  const [checkinTime,  setCheckinTime]  = useState('13:00')
  const [checkoutTime, setCheckoutTime] = useState('12:00')

  // ── Rooms ───────────────────────────────────────────────────────
  const [available, setAvailable] = useState<RoomOption[]>([])
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [picked, setPicked] = useState<GroupRoom[]>([])

  // ── Meta ────────────────────────────────────────────────────────
  const [source,     setSource]     = useState<ReservationSource>('phone')
  const [payMethod,  setPayMethod]  = useState<PaymentMethod>('unpaid')
  const [payStatus,  setPayStatus]  = useState<PaymentStatus>('unpaid')
  const [breakfast,  setBreakfast]  = useState(true)
  const [notes,         setNotes]         = useState('')
  const [internalNotes, setInternalNotes] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // ── Customer search ─────────────────────────────────────────────
  useEffect(() => {
    if (!custQuery.trim()) { setCustResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const { data } = await (supabase as any)
        .from('customers')
        .select('id, name, email, phone, street, postcode, city, country')
        .ilike('name', `%${custQuery}%`)
        .limit(8)
      setCustResults((data ?? []) as Customer[])
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custQuery])

  function applyCustomer(c: Customer) {
    setCustomerId(c.id)
    setGuestName(c.name)
    setGuestEmail(c.email ?? '')
    setGuestPhone(c.phone ?? '')
    setGuestStreet(c.street ?? '')
    setGuestPostcode(c.postcode ?? '')
    setGuestCity(c.city ?? '')
    setGuestCountry(c.country ?? '')
    setCustQuery(c.name)
    setCustResults([])
  }

  // ── Load rooms free for the shared range ────────────────────────
  const loadRooms = useCallback(async () => {
    if (!checkinDate || !checkoutDate) { setAvailable([]); return }
    setLoadingRooms(true)

    const { data } = await (supabase as any).rpc('get_available_rooms', {
      p_checkin_at:  buildCheckinTimestamp(checkinDate, checkinTime),
      p_checkout_at: buildCheckoutTimestamp(checkoutDate, checkoutTime),
      p_guest_count: 1,
    })

    // Pull the configured base price for each room type
    const { data: types } = await supabase
      .from('room_types').select('name, base_price')

    const priceByType = new Map<string, number | null>(
      ((types ?? []) as { name: string; base_price: number | null }[])
        .map(t => [t.name, t.base_price]),
    )

    const rooms = ((data ?? []) as any[]).map(r => ({
      id: r.id,
      room_number: r.room_number,
      name: r.name,
      type_name: r.type_name,
      max_capacity: r.max_capacity,
      base_price: priceByType.get(r.type_name) ?? null,
    })) as RoomOption[]

    setAvailable(rooms)
    // Drop anything that is no longer free for the new dates
    setPicked(prev => prev.filter(p => rooms.some(r => r.id === p.roomId)))
    setLoadingRooms(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkinDate, checkoutDate, checkinTime, checkoutTime])

  useEffect(() => { loadRooms() }, [loadRooms])

  const sharedNights = nightsBetween(checkinDate, checkoutDate)

  /** Suggested gross price for a room: base price × its nights. */
  function suggestPrice(room: RoomOption, nights: number): string {
    if (!room.base_price || nights <= 0) return ''
    return (room.base_price * nights).toFixed(2)
  }

  function toggleRoom(room: RoomOption) {
    setPicked(prev => {
      const existing = prev.find(p => p.roomId === room.id)
      if (existing) return prev.filter(p => p.roomId !== room.id)
      return [...prev, {
        roomId:   room.id,
        adults:   Math.min(2, room.max_capacity),
        children: 0,
        price:    suggestPrice(room, sharedNights),
        ownDates: false,
        checkin:  checkinDate,
        checkout: checkoutDate,
      }]
    })
  }

  function updateRoom(roomId: string, patch: Partial<GroupRoom>) {
    setPicked(prev => prev.map(p => p.roomId === roomId ? { ...p, ...patch } : p))
  }

  const roomById = (id: string) => available.find(r => r.id === id)

  /** Nights actually applying to a picked room. */
  function roomNights(p: GroupRoom): number {
    return p.ownDates ? nightsBetween(p.checkin, p.checkout) : sharedNights
  }

  const groupTotal  = picked.reduce((s, p) => s + (parseFloat(p.price) || 0), 0)
  const groupGuests = picked.reduce((s, p) => s + p.adults + p.children, 0)

  // ── Submit ──────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!guestName.trim())   { setError('Bitte einen Gast auswählen oder einen Namen eingeben.'); return }
    if (!checkinDate || !checkoutDate) { setError('Bitte An- und Abreisedatum wählen.'); return }
    if (picked.length === 0) { setError('Bitte mindestens ein Zimmer auswählen.'); return }

    for (const p of picked) {
      const room = roomById(p.roomId)
      if (!room) continue
      if (p.adults + p.children > room.max_capacity) {
        setError(`Zimmer ${room.room_number}: ${p.adults + p.children} Personen überschreiten die Kapazität (max. ${room.max_capacity}).`)
        return
      }
      if (roomNights(p) <= 0) {
        setError(`Zimmer ${room.room_number}: Abreise muss nach der Anreise liegen.`)
        return
      }
    }

    setSubmitting(true)
    try {
      // One customer record for the whole group
      const custId = customerId ?? await findOrCreateCustomer(supabase, {
        name: guestName, email: guestEmail, phone: guestPhone,
        street: guestStreet, postcode: guestPostcode, city: guestCity, country: guestCountry,
      })

      const groupId = crypto.randomUUID()
      const billingAddress = [
        guestStreet.trim(),
        [guestPostcode.trim(), guestCity.trim()].filter(Boolean).join(' '),
        guestCountry.trim(),
      ].filter(Boolean).join('\n') || null

      // One reservation per room so the calendar blocks each of them and the
      // no-overlap constraint still applies; the shared id ties them together.
      for (const p of picked) {
        const inAt  = buildCheckinTimestamp(p.ownDates ? p.checkin : checkinDate, checkinTime)
        const outAt = buildCheckoutTimestamp(p.ownDates ? p.checkout : checkoutDate, checkoutTime)

        const id = await createReservationSafe(supabase, {
          guest_name:         guestName,
          guest_email:        guestEmail || undefined,
          guest_phone:        guestPhone || undefined,
          room_id:            p.roomId,
          checkin_at:         inAt,
          checkout_at:        outAt,
          guest_count:        p.adults + p.children,
          breakfast_included: breakfast,
          source,
          payment_method:     payMethod,
          payment_status:     payStatus,
          total_price:        parseFloat(p.price) || undefined,
          notes:              notes || undefined,
        })

        await supabase.from('reservations').update({
          group_booking_id: groupId,
          customer_id:      custId,
          child_count:      p.children,
          internal_notes:   internalNotes || null,
          guest_street:     guestStreet   || null,
          guest_postcode:   guestPostcode || null,
          guest_city:       guestCity     || null,
          guest_country:    guestCountry  || null,
          billing_address:  billingAddress,
        }).eq('id', id)
      }

      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof ReservationError
        ? err.message
        : 'Ein unerwarteter Fehler ist aufgetreten. Bitte erneut versuchen.')
      setSubmitting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* ── 1. Gast ─────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-400" /> Gast / Kunde
        </h2>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Kunde suchen</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={custQuery} onChange={e => { setCustQuery(e.target.value); setCustomerId(null) }}
              placeholder="Name aus der Kundenliste…"
              className={cn(inp, 'pl-9')} />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
          </div>
          {custResults.length > 0 && (
            <div className="mt-1 rounded-lg border border-slate-200 overflow-hidden">
              {custResults.map((c, i) => (
                <button key={c.id} type="button" onClick={() => applyCustomer(c)}
                  className={cn('w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors',
                    i > 0 && 'border-t border-slate-100')}>
                  <p className="text-sm font-medium text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-400">
                    {[c.email, [c.postcode, c.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
                  </p>
                </button>
              ))}
            </div>
          )}
          {customerId && (
            <p className="mt-1.5 text-xs text-green-600 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Kunde verknüpft — Adresse übernommen
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Name <span className="text-red-500">*</span>
            </label>
            <input required value={guestName} onChange={e => setGuestName(e.target.value)}
              className={inp} placeholder="Firma oder Gastname" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">E-Mail</label>
            <input type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Telefon</label>
            <input type="tel" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} className={inp} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Straße &amp; Nr.</label>
            <input value={guestStreet} onChange={e => setGuestStreet(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">PLZ</label>
            <input value={guestPostcode} onChange={e => setGuestPostcode(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Stadt</label>
            <input value={guestCity} onChange={e => setGuestCity(e.target.value)} className={inp} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Land</label>
            <CountryInput value={guestCountry} onChange={setGuestCountry} className={inp} />
          </div>
        </div>
      </section>

      {/* ── 2. Zeitraum ─────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-slate-400" /> Zeitraum
          <span className="font-normal normal-case text-slate-400">(gilt für alle Zimmer)</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Anreise <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <DateInput required value={checkinDate} onChange={setCheckinDate} className="flex-1" />
              <TimeInput value={checkinTime} onChange={setCheckinTime} className="w-28" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Abreise <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <DateInput required value={checkoutDate} onChange={setCheckoutDate} min={checkinDate} className="flex-1" />
              <TimeInput value={checkoutTime} onChange={setCheckoutTime} className="w-28" />
            </div>
          </div>
        </div>
        {sharedNights > 0 && (
          <p className="text-sm text-slate-500">
            {sharedNights} Nacht{sharedNights !== 1 ? 'e' : ''}
          </p>
        )}
      </section>

      {/* ── 3. Zimmer ───────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
          <BedDouble className="w-4 h-4 text-slate-400" /> Zimmer auswählen
          {picked.length > 0 && (
            <span className="ml-auto rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-xs font-semibold normal-case tracking-normal">
              {picked.length} gewählt
            </span>
          )}
        </h2>

        {!checkinDate || !checkoutDate ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-400">
            Bitte zuerst den Zeitraum wählen.
          </p>
        ) : loadingRooms ? (
          <p className="text-sm text-slate-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Verfügbarkeit wird geprüft…
          </p>
        ) : available.length === 0 ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-600">
            Keine freien Zimmer in diesem Zeitraum.
          </p>
        ) : (
          <>
            {/* Picker */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {available.map(room => {
                const on = picked.some(p => p.roomId === room.id)
                return (
                  <button key={room.id} type="button" onClick={() => toggleRoom(room)}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-left transition-colors',
                      on ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                         : 'border-slate-300 bg-white hover:border-blue-300 hover:bg-blue-50',
                    )}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-sm text-slate-900">Zi. {room.room_number}</span>
                      {on && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                    </div>
                    <span className="block text-2xs text-slate-400 truncate">{room.type_name}</span>
                    <span className="block text-2xs text-slate-500 mt-0.5">
                      max. {room.max_capacity} Pers.
                      {room.base_price != null && ` · ${eur(room.base_price)}/Nacht`}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Per-room detail */}
            {picked.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                {picked.map(p => {
                  const room = roomById(p.roomId)
                  if (!room) return null
                  const n = roomNights(p)
                  const over = p.adults + p.children > room.max_capacity
                  return (
                    <div key={p.roomId}
                      className={cn('rounded-xl border p-3 space-y-3',
                        over ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50')}>

                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-slate-900">
                            Zimmer {room.room_number}
                            <span className="ml-1.5 font-normal text-xs text-slate-400">{room.type_name}</span>
                          </p>
                          <p className="text-2xs text-slate-400">
                            {n} Nacht{n !== 1 ? 'e' : ''} · max. {room.max_capacity} Pers.
                          </p>
                        </div>
                        <button type="button" onClick={() => toggleRoom(room)}
                          aria-label={`Zimmer ${room.room_number} entfernen`}
                          className="grid place-items-center w-8 h-8 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-2xs text-slate-500 mb-1">Erwachsene</label>
                          <input type="number" min={1} max={room.max_capacity} value={p.adults}
                            onChange={e => updateRoom(p.roomId, { adults: Math.max(1, Number(e.target.value)) })}
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-2xs text-slate-500 mb-1">Kinder</label>
                          <input type="number" min={0} max={room.max_capacity} value={p.children}
                            onChange={e => updateRoom(p.roomId, { children: Math.max(0, Number(e.target.value)) })}
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-2xs text-slate-500 mb-1">
                            Preis gesamt (€)
                            {room.base_price != null && (
                              <button type="button"
                                onClick={() => updateRoom(p.roomId, { price: suggestPrice(room, n) })}
                                className="ml-1.5 text-blue-600 hover:text-blue-700 font-medium">
                                ↻ {eur(room.base_price * n)}
                              </button>
                            )}
                          </label>
                          <input type="number" min={0} step="0.01" value={p.price}
                            onChange={e => updateRoom(p.roomId, { price: e.target.value })}
                            placeholder="0.00"
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>

                      {/* Optional own dates */}
                      <div>
                        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                          <input type="checkbox" checked={p.ownDates}
                            onChange={e => updateRoom(p.roomId, {
                              ownDates: e.target.checked,
                              checkin:  p.checkin  || checkinDate,
                              checkout: p.checkout || checkoutDate,
                            })}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                          Abweichende Daten für dieses Zimmer
                        </label>
                        {p.ownDates && (
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <DateInput value={p.checkin}
                              onChange={v => updateRoom(p.roomId, { checkin: v })} />
                            <DateInput value={p.checkout} min={p.checkin}
                              onChange={v => updateRoom(p.roomId, { checkout: v })} />
                          </div>
                        )}
                      </div>

                      {over && (
                        <p className="text-xs text-red-600">
                          {p.adults + p.children} Personen überschreiten die Kapazität ({room.max_capacity}).
                        </p>
                      )}
                    </div>
                  )
                })}

                {/* Group summary */}
                <div className="rounded-xl bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">
                      {picked.length} Zimmer · {groupGuests} Person{groupGuests !== 1 ? 'en' : ''}
                    </p>
                    <p className="font-semibold text-sm">Gesamtpreis</p>
                  </div>
                  <span className="text-xl font-black">{eur(groupTotal)}</span>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── 4. Quelle & Zahlung ─────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Quelle &amp; Zahlung</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Buchungsquelle</label>
            <select value={source} onChange={e => setSource(e.target.value as ReservationSource)} className={inp}>
              {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Zahlungsmethode</label>
            <select value={payMethod} onChange={e => setPayMethod(e.target.value as PaymentMethod)} className={inp}>
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Zahlungsstatus</label>
            <select value={payStatus} onChange={e => setPayStatus(e.target.value as PaymentStatus)} className={inp}>
              {PAYMENT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={breakfast} onChange={e => setBreakfast(e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-sm text-slate-700">Frühstück inklusive (in den Zimmerpreisen enthalten)</span>
        </label>
      </section>

      {/* ── 5. Notizen ──────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Notizen <span className="text-xs font-normal text-slate-400">(erscheint in E-Mail &amp; Rechnung)</span>
          </label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
            className={cn(inp, 'resize-none')} placeholder="Sonderwünsche, Ansprechpartner…" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Interne Notizen <span className="text-xs font-normal text-slate-400">(nur intern)</span>
          </label>
          <textarea rows={2} value={internalNotes} onChange={e => setInternalNotes(e.target.value)}
            className={cn(inp, 'resize-none')} />
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
        <button type="button" onClick={() => router.back()}
          className="rounded-xl border border-slate-300 px-5 h-11 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
          Abbrechen
        </button>
        <button type="submit" disabled={submitting || picked.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 h-11 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {submitting
            ? 'Wird erstellt…'
            : `Gruppenbuchung erstellen${picked.length > 0 ? ` (${picked.length} Zimmer)` : ''}`}
        </button>
      </div>
    </form>
  )
}
