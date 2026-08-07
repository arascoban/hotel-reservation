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
import DepositEditor, { type DepositState, EMPTY_DEPOSIT, depositPayload } from '@/components/Deposit/DepositEditor'
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
  max_adults: number
  max_children: number
  base_price: number | null
}

/** Connecting-door pairs sold as one family unit — booking one blocks both. */
const FAMILY_PAIRS = [
  { key: 'fam:11+12', numbers: ['11', '12'], label: 'Familienzimmer 11+12' },
  { key: 'fam:19+20', numbers: ['19', '20'], label: 'Familienzimmer 19+20' },
  { key: 'fam:21+22', numbers: ['21', '22'], label: 'Familienzimmer 21+22' },
]

/**
 * Something the user can pick: a single room, or a family pair that occupies
 * two rooms but is priced and counted as one unit.
 */
interface Unit {
  key:          string
  roomIds:      string[]
  label:        string
  typeName:     string
  maxAdults:    number
  maxChildren:  number
  maxCapacity:  number
  basePrice:    number | null
  isFamily:     boolean
}

/** One selected unit inside the group. */
interface GroupRoom {
  key:         string
  adults:      number
  children:    number
  price:       string   // gross for the whole stay of this unit
  /** Own dates instead of the shared range. */
  ownDates:    boolean
  checkin:     string
  checkout:    string
}

const SOURCES: { value: ReservationSource; label: string }[] = [
  { value: 'phone',   label: 'Telefon' },
  { value: 'email',   label: 'E-Mail' },
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
  const [familyType, setFamilyType] = useState<{
    base_price: number | null; max_adults: number | null
    max_children: number | null; max_capacity: number
  } | null>(null)

  // ── Meta ────────────────────────────────────────────────────────
  const [source,     setSource]     = useState<ReservationSource>('phone')
  const [payMethod,  setPayMethod]  = useState<PaymentMethod>('unpaid')
  const [payStatus,  setPayStatus]  = useState<PaymentStatus>('unpaid')
  const [breakfast,  setBreakfast]  = useState(true)
  const [notes,         setNotes]         = useState('')
  const [internalNotes, setInternalNotes] = useState('')

  const [deposit,    setDeposit]    = useState<DepositState>(EMPTY_DEPOSIT)
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
      .from('room_types').select('name, category, base_price, max_adults, max_children, max_capacity')

    const typeRows = (types ?? []) as {
      name: string; category: string; base_price: number | null
      max_adults: number | null; max_children: number | null; max_capacity: number
    }[]
    const byType = new Map(typeRows.map(t => [t.name, t]))
    setFamilyType(typeRows.find(t => t.category === 'family_connecting') ?? null)

    const rooms = ((data ?? []) as any[]).map(r => {
      const t = byType.get(r.type_name)
      return {
        id: r.id,
        room_number: r.room_number,
        name: r.name,
        type_name: r.type_name,
        max_capacity: r.max_capacity,
        max_adults:   t?.max_adults   ?? r.max_capacity,
        max_children: t?.max_children ?? 0,
        base_price:   t?.base_price   ?? null,
      }
    }) as RoomOption[]

    setAvailable(rooms)
    // Drop picks whose rooms are no longer free for the new dates
    const freeIds = new Set(rooms.map(r => r.id))
    setPicked(prev => prev.filter(p => {
      if (!p.key.startsWith('fam:')) return freeIds.has(p.key)
      const pair = FAMILY_PAIRS.find(f => f.key === p.key)
      return !!pair && pair.numbers.every(n => rooms.some(r => r.room_number === n))
    }))
    setLoadingRooms(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkinDate, checkoutDate, checkinTime, checkoutTime])

  useEffect(() => { loadRooms() }, [loadRooms])

  const sharedNights = nightsBetween(checkinDate, checkoutDate)

  // ── Selectable units ────────────────────────────────────────────
  // A family pair only shows up when both of its rooms are free; picking it
  // blocks both but is priced and counted as a single unit.
  const familyUnits: Unit[] = FAMILY_PAIRS.flatMap(pair => {
    const r1 = available.find(r => r.room_number === pair.numbers[0])
    const r2 = available.find(r => r.room_number === pair.numbers[1])
    if (!r1 || !r2) return []
    return [{
      key:         pair.key,
      roomIds:     [r1.id, r2.id],
      label:       pair.label,
      typeName:    'Familienzimmer mit Verbindungstür',
      maxAdults:   familyType?.max_adults   ?? 4,
      maxChildren: familyType?.max_children ?? 2,
      maxCapacity: familyType?.max_capacity ?? 5,
      basePrice:   familyType?.base_price   ?? null,
      isFamily:    true,
    }]
  })

  const roomUnits: Unit[] = available.map(r => ({
    key:         r.id,
    roomIds:     [r.id],
    label:       `Zimmer ${r.room_number}`,
    typeName:    r.type_name,
    maxAdults:   r.max_adults,
    maxChildren: r.max_children,
    maxCapacity: r.max_capacity,
    basePrice:   r.base_price,
    isFamily:    false,
  }))

  const units = [...familyUnits, ...roomUnits]
  const unitByKey = (key: string) => units.find(u => u.key === key)

  /** Room ids already taken by the current selection. */
  const usedRoomIds = new Set(
    picked.flatMap(p => unitByKey(p.key)?.roomIds ?? []),
  )

  /** A unit is blocked when one of its rooms is already used by another pick. */
  function isBlocked(u: Unit): boolean {
    if (picked.some(p => p.key === u.key)) return false
    return u.roomIds.some(id => usedRoomIds.has(id))
  }

  /** Suggested gross price for a unit: base price × its nights. */
  function suggestPrice(u: Unit, nights: number): string {
    if (!u.basePrice || nights <= 0) return ''
    return (u.basePrice * nights).toFixed(2)
  }

  function toggleUnit(u: Unit) {
    setPicked(prev => {
      if (prev.some(p => p.key === u.key)) return prev.filter(p => p.key !== u.key)
      return [...prev, {
        key:      u.key,
        adults:   Math.min(2, u.maxAdults),
        children: 0,
        price:    suggestPrice(u, sharedNights),
        ownDates: false,
        checkin:  checkinDate,
        checkout: checkoutDate,
      }]
    })
  }

  function updateRoom(key: string, patch: Partial<GroupRoom>) {
    setPicked(prev => prev.map(p => p.key === key ? { ...p, ...patch } : p))
  }

  /** Nights actually applying to a picked unit. */
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
      const u = unitByKey(p.key)
      if (!u) continue
      if (p.adults > u.maxAdults) {
        setError(`${u.label}: max. ${u.maxAdults} Erwachsene.`); return
      }
      if (p.children > u.maxChildren) {
        setError(`${u.label}: max. ${u.maxChildren} Kind${u.maxChildren !== 1 ? 'er' : ''}.`); return
      }
      if (p.adults + p.children > u.maxCapacity) {
        setError(`${u.label}: ${p.adults + p.children} Personen überschreiten die Kapazität (max. ${u.maxCapacity}).`)
        return
      }
      if (roomNights(p) <= 0) {
        setError(`${u.label}: Abreise muss nach der Anreise liegen.`); return
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
      // The group's deposit is one amount for the whole booking, so it is
      // stored once — on the first reservation created — rather than repeated
      // on every room.
      const { deposit_paid_amount, deposit_paid_at, deposit_paid_method, ...groupDeposit } =
        depositPayload(deposit, groupTotal)
      let isFirstRoom = true
      const billingAddress = [
        guestStreet.trim(),
        [guestPostcode.trim(), guestCity.trim()].filter(Boolean).join(' '),
        guestCountry.trim(),
      ].filter(Boolean).join('\n') || null

      // One reservation per room so the calendar blocks each of them and the
      // no-overlap constraint still applies; the shared id ties them together.
      // A family unit covers two rooms — they additionally share a
      // family_booking_id so they stay recognisable as one room.
      for (const p of picked) {
        const u = unitByKey(p.key)
        if (!u) continue

        const inAt  = buildCheckinTimestamp(p.ownDates ? p.checkin : checkinDate, checkinTime)
        const outAt = buildCheckoutTimestamp(p.ownDates ? p.checkout : checkoutDate, checkoutTime)
        const familyId = u.isFamily ? crypto.randomUUID() : null

        for (const roomId of u.roomIds) {
          const id = await createReservationSafe(supabase, {
            guest_name:         guestName,
            guest_email:        guestEmail || undefined,
            guest_phone:        guestPhone || undefined,
            room_id:            roomId,
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
            ...(isFirstRoom ? groupDeposit : {}),
            group_booking_id:  groupId,
            family_booking_id: familyId,
            customer_id:       custId,
            child_count:       p.children,
            internal_notes:    internalNotes || null,
            guest_street:      guestStreet   || null,
            guest_postcode:    guestPostcode || null,
            guest_city:        guestCity     || null,
            guest_country:     guestCountry  || null,
            billing_address:   billingAddress,
          }).eq('id', id)
          isFirstRoom = false
        }
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
            {/* Picker — family units first, then single rooms */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {units.map(u => {
                const on      = picked.some(p => p.key === u.key)
                const blocked = isBlocked(u)
                return (
                  <button key={u.key} type="button" disabled={blocked}
                    onClick={() => toggleUnit(u)}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-left transition-colors',
                      blocked ? 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
                      : on    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                              : 'border-slate-300 bg-white hover:border-blue-300 hover:bg-blue-50',
                      u.isFamily && !blocked && !on && 'border-purple-300 bg-purple-50/40',
                    )}>
                    <div className="flex items-center justify-between gap-1">
                      <span className={cn('font-semibold text-sm',
                        blocked ? 'text-slate-300' : 'text-slate-900')}>
                        {u.isFamily ? '👨‍👩‍👧 ' : ''}{u.label}
                      </span>
                      {on && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                    </div>
                    <span className="block text-2xs text-slate-400 truncate">{u.typeName}</span>
                    <span className="block text-2xs text-slate-500 mt-0.5">
                      {blocked
                        ? 'Zimmer bereits vergeben'
                        : <>max. {u.maxAdults} Erw.{u.maxChildren > 0 && ` + ${u.maxChildren} Ki.`}
                           {u.basePrice != null && ` · ${eur(u.basePrice)}/N`}</>}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Per-unit detail */}
            {picked.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                {picked.map(p => {
                  const u = unitByKey(p.key)
                  if (!u) return null
                  const n = roomNights(p)
                  const overAdults   = p.adults   > u.maxAdults
                  const overChildren = p.children > u.maxChildren
                  const overTotal    = p.adults + p.children > u.maxCapacity
                  const bad = overAdults || overChildren || overTotal
                  return (
                    <div key={p.key}
                      className={cn('rounded-xl border p-3 space-y-3',
                        bad ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50')}>

                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-slate-900">
                            {u.isFamily ? '👨‍👩‍👧 ' : ''}{u.label}
                            <span className="ml-1.5 font-normal text-xs text-slate-400">{u.typeName}</span>
                          </p>
                          <p className="text-2xs text-slate-400">
                            {n} Nacht{n !== 1 ? 'e' : ''} · max. {u.maxAdults} Erw.
                            {u.maxChildren > 0 && ` + ${u.maxChildren} Ki.`}
                            {u.isFamily && ' · belegt beide Zimmer'}
                          </p>
                        </div>
                        <button type="button" onClick={() => toggleUnit(u)}
                          aria-label={`${u.label} entfernen`}
                          className="grid place-items-center w-8 h-8 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="block text-2xs text-slate-500 mb-1">Erwachsene</label>
                          <input type="number" min={1} max={u.maxAdults} value={p.adults}
                            onChange={e => updateRoom(p.key, { adults: Math.max(1, Number(e.target.value)) })}
                            className={cn('w-full rounded-lg border px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500',
                              overAdults ? 'border-red-400' : 'border-slate-300')} />
                        </div>
                        <div>
                          <label className="block text-2xs text-slate-500 mb-1">Kinder</label>
                          <input type="number" min={0} max={u.maxChildren} value={p.children}
                            disabled={u.maxChildren === 0}
                            onChange={e => updateRoom(p.key, { children: Math.max(0, Number(e.target.value)) })}
                            className={cn('w-full rounded-lg border px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400',
                              overChildren ? 'border-red-400' : 'border-slate-300')} />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-2xs text-slate-500 mb-1">
                            Preis gesamt (€)
                            {u.basePrice != null && (
                              <button type="button"
                                onClick={() => updateRoom(p.key, { price: suggestPrice(u, n) })}
                                className="ml-1.5 text-blue-600 hover:text-blue-700 font-medium">
                                ↻ {eur(u.basePrice * n)}
                              </button>
                            )}
                          </label>
                          <input type="number" min={0} step="0.01" value={p.price}
                            onChange={e => updateRoom(p.key, { price: e.target.value })}
                            placeholder="0.00"
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                      </div>

                      {/* Optional own dates */}
                      <div>
                        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                          <input type="checkbox" checked={p.ownDates}
                            onChange={e => updateRoom(p.key, {
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
                              onChange={v => updateRoom(p.key, { checkin: v })} />
                            <DateInput value={p.checkout} min={p.checkin}
                              onChange={v => updateRoom(p.key, { checkout: v })} />
                          </div>
                        )}
                      </div>

                      {bad && (
                        <p className="text-xs text-red-600">
                          {overAdults   && `Max. ${u.maxAdults} Erwachsene. `}
                          {overChildren && `Max. ${u.maxChildren} Kind${u.maxChildren !== 1 ? 'er' : ''}. `}
                          {overTotal    && `Max. ${u.maxCapacity} Personen insgesamt.`}
                        </p>
                      )}
                    </div>
                  )
                })}

                {/* Group summary */}
                <div className="rounded-xl bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">
                      {picked.length} Einheit{picked.length !== 1 ? 'en' : ''} ·
                      {' '}{picked.reduce((s2, p) => s2 + (unitByKey(p.key)?.roomIds.length ?? 0), 0)} Zimmer ·
                      {' '}{groupGuests} Person{groupGuests !== 1 ? 'en' : ''}
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

        {/* Requested deposit for the whole group — shown on the confirmation */}
        <DepositEditor
          value={deposit}
          onChange={setDeposit}
          total={groupTotal}
          hidePayment
        />
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
