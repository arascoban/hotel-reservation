'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  validateReservationInput,
  checkRoomAvailability,
  createReservationSafe,
  buildCheckinTimestamp,
  buildCheckoutTimestamp,
  formatDate,
  ReservationError,
} from '@/lib/reservations'
import type { AvailableRoom, ReservationSource, PaymentMethod, PaymentStatus } from '@/types/database'
import { cn } from '@/lib/cn'
import DateInput from '@/components/ui/DateInput'
import TimeInput from '@/components/ui/TimeInput'

// ── Family room definitions ────────────────────────────────────────────────────
// Each pair shares a connecting door; booking a family room blocks BOTH rooms.
const FAMILY_ROOM_PAIRS = [
  { key: '11+12', label: 'Familienzimmer 11+12 (Verbindungstür)', numbers: ['11', '12'], maxCapacity: 4 },
  { key: '19+20', label: 'Familienzimmer 19+20 (Verbindungstür)', numbers: ['19', '20'], maxCapacity: 4 },
  { key: '21+22', label: 'Familienzimmer 21+22 (Verbindungstür)', numbers: ['21', '22'], maxCapacity: 3 },
]

const SOURCES: { value: ReservationSource; label: string }[] = [
  { value: 'booking_com', label: 'Booking.com' },
  { value: 'expedia',     label: 'Expedia' },
  { value: 'airbnb',      label: 'Airbnb' },
  { value: 'walk_in',     label: 'Laufkundschaft' },
  { value: 'phone',       label: 'Telefon' },
  { value: 'website',     label: 'Website' },
  { value: 'other',       label: 'Sonstige' },
]

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash',        label: 'Bargeld' },
  { value: 'ec_card',     label: 'EC-Karte' },
  { value: 'credit_card', label: 'Kreditkarte' },
  { value: 'online',      label: 'Online' },
  { value: 'unpaid',      label: 'Noch nicht bezahlt' },
]

const PAYMENT_STATUSES: { value: PaymentStatus; label: string }[] = [
  { value: 'unpaid',       label: 'Unbezahlt' },
  { value: 'deposit_paid', label: 'Anzahlung bezahlt' },
  { value: 'paid',         label: 'Vollständig bezahlt' },
  { value: 'refunded',     label: 'Erstattet' },
]

interface Props {
  defaultRoomId?: string
  defaultCheckin?: string   // yyyy-MM-dd
  defaultCheckout?: string  // yyyy-MM-dd
}

export default function ReservationForm({ defaultRoomId, defaultCheckin, defaultCheckout }: Props) {
  const router = useRouter()
  const supabase = createClient()

  // ── Booking type ────────────────────────────────────────────────
  const [bookingType, setBookingType] = useState<'single' | 'family'>('single')
  const [familyKey,   setFamilyKey]   = useState<string>('')

  // ── Form state ──────────────────────────────────────────────────
  const [guestName,    setGuestName]    = useState('')
  const [guestPhone,   setGuestPhone]   = useState('')
  const [guestEmail,   setGuestEmail]   = useState('')
  const [guestCount,   setGuestCount]   = useState(2)
  const [checkinDate,  setCheckinDate]  = useState(defaultCheckin  ?? '')
  const [checkoutDate, setCheckoutDate] = useState(defaultCheckout ?? '')
  const [checkinTime,  setCheckinTime]  = useState('13:00')
  const [checkoutTime, setCheckoutTime] = useState('12:00')
  const [roomId,       setRoomId]       = useState(defaultRoomId   ?? '')
  const [breakfast,    setBreakfast]    = useState(false)
  const [source,       setSource]       = useState<ReservationSource>('phone')
  const [payMethod,    setPayMethod]    = useState<PaymentMethod>('unpaid')
  const [payStatus,    setPayStatus]    = useState<PaymentStatus>('unpaid')
  const [totalPrice,   setTotalPrice]   = useState('')
  const [notes,        setNotes]        = useState('')
  const [extId,        setExtId]        = useState('')

  // ── UI state ────────────────────────────────────────────────────
  const [availableRooms,    setAvailableRooms]    = useState<AvailableRoom[]>([])
  const [maintenanceRoomIds, setMaintenanceRoomIds] = useState<Set<string>>(new Set())
  const [loadingRooms,      setLoadingRooms]      = useState(false)
  const [conflictMsg,       setConflictMsg]       = useState<string | null>(null)
  const [fieldErrors,    setFieldErrors]    = useState<Record<string, string>>({})
  const [submitError,    setSubmitError]    = useState<string | null>(null)
  const [submitting,     setSubmitting]     = useState(false)

  // ── Selected room info ──────────────────────────────────────────
  const selectedRoom = availableRooms.find(r => r.id === roomId) ?? null

  // ── Family room availability ────────────────────────────────────
  const familyOptions = FAMILY_ROOM_PAIRS.map(pair => {
    const room1 = availableRooms.find(r => r.room_number === pair.numbers[0])
    const room2 = availableRooms.find(r => r.room_number === pair.numbers[1])
    const inMaintenance = (room1 && maintenanceRoomIds.has(room1.id)) || (room2 && maintenanceRoomIds.has(room2.id))
    return { ...pair, room1, room2, available: !!room1 && !!room2 && !inMaintenance, inMaintenance: !!inMaintenance }
  })
  const selectedFamily = familyOptions.find(f => f.key === familyKey) ?? null

  // ── Fetch available rooms when dates/times/guest count change ───
  const fetchAvailableRooms = useCallback(async () => {
    if (!checkinDate || !checkoutDate) return
    setLoadingRooms(true)
    setConflictMsg(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_available_rooms', {
      p_checkin_at:  buildCheckinTimestamp(checkinDate, checkinTime),
      p_checkout_at: buildCheckoutTimestamp(checkoutDate, checkoutTime),
      p_guest_count: bookingType === 'family' ? 1 : guestCount,
    })

    if (!error && data) {
      const rooms = data as AvailableRoom[]
      setAvailableRooms(rooms)

      // Fetch cleaning status so maintenance rooms can be shown as unavailable
      if (rooms.length > 0) {
        const { data: statusData } = await supabase
          .from('rooms')
          .select('id, cleaning_status')
          .in('id', rooms.map((r: AvailableRoom) => r.id))
        const maintIds = new Set<string>(
          (statusData ?? [])
            .filter((r: { id: string; cleaning_status: string }) => r.cleaning_status === 'maintenance')
            .map((r: { id: string }) => r.id)
        )
        setMaintenanceRoomIds(maintIds)
        // Deselect room if it is now in maintenance
        if (bookingType === 'single' && roomId && maintIds.has(roomId)) setRoomId('')
      } else {
        setMaintenanceRoomIds(new Set())
      }

      if (bookingType === 'single' && roomId && !(rooms as AvailableRoom[]).find((r: AvailableRoom) => r.id === roomId)) {
        setRoomId('')
      }
      // Reset family key if it's no longer available
      if (bookingType === 'family' && familyKey) {
        const pair = FAMILY_ROOM_PAIRS.find(p => p.key === familyKey)
        if (pair) {
          const r1 = (rooms as AvailableRoom[]).find((r: AvailableRoom) => r.room_number === pair.numbers[0])
          const r2 = (rooms as AvailableRoom[]).find((r: AvailableRoom) => r.room_number === pair.numbers[1])
          if (!r1 || !r2) setFamilyKey('')
        }
      }
    }
    setLoadingRooms(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkinDate, checkoutDate, checkinTime, checkoutTime, guestCount, bookingType])

  useEffect(() => {
    fetchAvailableRooms()
  }, [fetchAvailableRooms])

  // Reset selections when switching booking type
  function switchBookingType(type: 'single' | 'family') {
    setBookingType(type)
    setRoomId('')
    setFamilyKey('')
    setConflictMsg(null)
  }

  // ── Pre-submit availability check for single room ───────────────
  async function handleRoomChange(newRoomId: string) {
    setRoomId(newRoomId)
    setConflictMsg(null)
    if (!newRoomId || !checkinDate || !checkoutDate) return

    const result = await checkRoomAvailability(
      supabase,
      newRoomId,
      new Date(buildCheckinTimestamp(checkinDate, checkinTime)),
      new Date(buildCheckoutTimestamp(checkoutDate, checkoutTime)),
    )
    if (!result.available) {
      const r = result.conflicting_reservation!
      setConflictMsg(
        `Dieses Zimmer ist bereits belegt vom ${formatDate(r.checkin_at)} bis ${formatDate(r.checkout_at)}.`,
      )
    }
  }

  // ── Submit ──────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setConflictMsg(null)

    // ── Family room booking ───────────────────────────────────────
    if (bookingType === 'family') {
      if (!familyKey || !selectedFamily) {
        setFieldErrors({ room_id: 'Bitte ein Familienzimmer auswählen.' })
        return
      }
      if (!selectedFamily.available) {
        setConflictMsg('Dieses Familienzimmer ist für die gewählten Daten nicht verfügbar.')
        return
      }
      if (!checkinDate || !checkoutDate) {
        setFieldErrors({ checkin_at: 'Anreisedatum ist erforderlich.', checkout_at: 'Abreisedatum ist erforderlich.' })
        return
      }
      if (!guestName.trim()) {
        setFieldErrors({ guest_name: 'Name des Gastes ist erforderlich.' })
        return
      }
      if (guestCount > selectedFamily.maxCapacity) {
        setFieldErrors({ guest_count: `Dieses Familienzimmer hat eine maximale Kapazität von ${selectedFamily.maxCapacity} Personen.` })
        return
      }

      setFieldErrors({})
      setSubmitting(true)

      const baseInput = {
        guest_name:         guestName,
        guest_email:        guestEmail  || undefined,
        guest_phone:        guestPhone  || undefined,
        checkin_at:         buildCheckinTimestamp(checkinDate, checkinTime),
        checkout_at:        buildCheckoutTimestamp(checkoutDate, checkoutTime),
        guest_count:        guestCount,
        breakfast_included: breakfast,
        source,
        payment_method:     payMethod,
        payment_status:     payStatus,
        total_price:        totalPrice ? parseFloat(totalPrice) : undefined,
        notes:              notes      || undefined,
        external_id:        extId      || undefined,
      }

      try {
        // Create both room reservations
        const id1 = await createReservationSafe(supabase, { ...baseInput, room_id: selectedFamily.room1!.id })
        const id2 = await createReservationSafe(supabase, { ...baseInput, room_id: selectedFamily.room2!.id })

        // Link them with the same family_booking_id so they deduplicate in list views
        const familyId = crypto.randomUUID()
        await supabase.from('reservations').update({ family_booking_id: familyId }).eq('id', id1)
        await supabase.from('reservations').update({ family_booking_id: familyId }).eq('id', id2)

        router.push('/')
        router.refresh()
      } catch (err) {
        if (err instanceof ReservationError) {
          if (err.message.includes('belegt')) setConflictMsg(err.message)
          else setSubmitError(err.message)
        } else {
          setSubmitError('Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.')
        }
        setSubmitting(false)
      }
      return
    }

    // ── Single room booking ───────────────────────────────────────
    const validation = validateReservationInput(
      {
        guest_name:   guestName,
        guest_email:  guestEmail || undefined,
        guest_phone:  guestPhone || undefined,
        room_id:      roomId,
        checkin_at:   checkinDate  ? buildCheckinTimestamp(checkinDate, checkinTime)   : undefined,
        checkout_at:  checkoutDate ? buildCheckoutTimestamp(checkoutDate, checkoutTime) : undefined,
        guest_count:  guestCount,
      },
      selectedRoom?.max_capacity,
    )

    if (!validation.valid) {
      setFieldErrors(validation.errors)
      return
    }

    setFieldErrors({})
    setSubmitting(true)

    try {
      await createReservationSafe(supabase, {
        guest_name:         guestName,
        guest_email:        guestEmail  || undefined,
        guest_phone:        guestPhone  || undefined,
        room_id:            roomId,
        checkin_at:         buildCheckinTimestamp(checkinDate, checkinTime),
        checkout_at:        buildCheckoutTimestamp(checkoutDate, checkoutTime),
        guest_count:        guestCount,
        breakfast_included: breakfast,
        source,
        payment_method:     payMethod,
        payment_status:     payStatus,
        total_price:        totalPrice ? parseFloat(totalPrice) : undefined,
        notes:              notes      || undefined,
        external_id:        extId      || undefined,
      })

      router.push('/')
      router.refresh()
    } catch (err) {
      if (err instanceof ReservationError) {
        if (err.message.includes('belegt')) setConflictMsg(err.message)
        else setSubmitError(err.message)
      } else {
        setSubmitError('Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.')
      }
      setSubmitting(false)
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────
  function fieldClass(name: string) {
    return cn(
      'w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
      fieldErrors[name] ? 'border-red-400 bg-red-50' : 'border-slate-300',
    )
  }

  const hasConflict = !!conflictMsg

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Buchungstyp ─── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
          Buchungstyp
        </h2>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => switchBookingType('single')}
            className={cn(
              'flex-1 py-2.5 text-sm font-medium transition-colors',
              bookingType === 'single'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            Einzelzimmer / Doppelzimmer
          </button>
          <button
            type="button"
            onClick={() => switchBookingType('family')}
            className={cn(
              'flex-1 py-2.5 text-sm font-medium transition-colors border-l border-slate-200',
              bookingType === 'family'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            Familienzimmer (2 Zimmer)
          </button>
        </div>
        {bookingType === 'family' && (
          <p className="mt-2 text-xs text-slate-500">
            Beide verbundenen Zimmer werden automatisch für den gewählten Zeitraum blockiert.
          </p>
        )}
      </section>

      {/* ── Gastinformationen ─── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Gastinformationen
        </h2>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Vollständiger Name <span className="text-red-500">*</span>
          </label>
          <input type="text" required value={guestName}
            onChange={e => setGuestName(e.target.value)}
            className={fieldClass('guest_name')} placeholder="Max Mustermann" />
          {fieldErrors.guest_name && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.guest_name}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Telefon</label>
            <input type="tel" value={guestPhone}
              onChange={e => setGuestPhone(e.target.value)}
              className={fieldClass('guest_phone')} placeholder="+49 …" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">E-Mail</label>
            <input type="email" value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
              className={fieldClass('guest_email')} placeholder="gast@beispiel.de" />
            {fieldErrors.guest_email && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.guest_email}</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Aufenthaltsdetails ─── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Aufenthaltsdetails
        </h2>

        <div className="grid grid-cols-2 gap-4">
          {/* Anreise: date + time */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Anreise <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <DateInput
                required
                value={checkinDate}
                onChange={setCheckinDate}
                className={cn('flex-1', fieldErrors.checkin_at && 'border-red-400 bg-red-50')}
              />
              <TimeInput value={checkinTime} onChange={setCheckinTime} className="w-28" />
            </div>
            {fieldErrors.checkin_at && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.checkin_at}</p>
            )}
          </div>

          {/* Abreise: date + time */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Abreise <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <DateInput
                required
                value={checkoutDate}
                onChange={setCheckoutDate}
                min={checkinDate}
                className={cn('flex-1', fieldErrors.checkout_at && 'border-red-400 bg-red-50')}
              />
              <TimeInput value={checkoutTime} onChange={setCheckoutTime} className="w-28" />
            </div>
            {fieldErrors.checkout_at && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.checkout_at}</p>
            )}
          </div>
        </div>

        {/* Personen */}
        <div className="max-w-xs">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Personen <span className="text-red-500">*</span>
          </label>
          <input type="number" min={1} max={bookingType === 'family' ? 6 : 4} required value={guestCount}
            onChange={e => setGuestCount(Number(e.target.value))}
            className={fieldClass('guest_count')} />
          {fieldErrors.guest_count && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.guest_count}</p>
          )}
        </div>

        {/* ── Zimmerauswahl: Einzelzimmer ── */}
        {bookingType === 'single' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Zimmer <span className="text-red-500">*</span>
            </label>
            {loadingRooms ? (
              <div className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-400 bg-slate-50">
                Verfügbarkeit wird geprüft…
              </div>
            ) : !checkinDate || !checkoutDate ? (
              <div className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-400 bg-slate-50">
                Bitte Datum wählen um verfügbare Zimmer zu sehen.
              </div>
            ) : (
              <select
                value={roomId}
                onChange={e => handleRoomChange(e.target.value)}
                className={cn(fieldClass('room_id'), 'cursor-pointer')}
              >
                <option value="">— Zimmer wählen —</option>
                {availableRooms.map(r => {
                  const inMaintenance = maintenanceRoomIds.has(r.id)
                  return (
                    <option key={r.id} value={r.id} disabled={inMaintenance}>
                      {inMaintenance
                        ? `⚠ ${r.name} — Erfordert Wartung`
                        : `${r.name} — ${r.type_name} (max. ${r.max_capacity} Pers.)`}
                    </option>
                  )
                })}
              </select>
            )}

            {availableRooms.length === 0 && checkinDate && checkoutDate && !loadingRooms && (
              <p className="mt-1 text-xs text-red-600">
                Keine Zimmer verfügbar für {guestCount} Person{guestCount !== 1 ? 'en' : ''} an diesen Daten.
              </p>
            )}
            {fieldErrors.room_id && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.room_id}</p>
            )}
          </div>
        )}

        {/* ── Zimmerauswahl: Familienzimmer ── */}
        {bookingType === 'family' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Familienzimmer wählen <span className="text-red-500">*</span>
            </label>
            {loadingRooms ? (
              <div className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-400 bg-slate-50">
                Verfügbarkeit wird geprüft…
              </div>
            ) : !checkinDate || !checkoutDate ? (
              <div className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-400 bg-slate-50">
                Bitte zuerst Anreise- und Abreisedatum wählen.
              </div>
            ) : (
              <div className="space-y-2">
                {familyOptions.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={!opt.available}
                    onClick={() => { setFamilyKey(opt.key); setConflictMsg(null) }}
                    className={cn(
                      'w-full text-left rounded-lg border px-4 py-3 text-sm transition-colors',
                      !opt.available
                        ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
                        : familyKey === opt.key
                          ? 'border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-200'
                          : 'border-slate-300 bg-white text-slate-900 hover:border-blue-300 hover:bg-blue-50 cursor-pointer',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{opt.label}</span>
                      <span className={cn(
                        'text-xs font-medium px-2 py-0.5 rounded-full',
                        opt.available
                          ? 'bg-green-100 text-green-700'
                          : opt.inMaintenance
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-red-100 text-red-600',
                      )}>
                        {opt.available ? 'Verfügbar' : opt.inMaintenance ? '⚠ Wartung' : 'Belegt'}
                      </span>
                    </div>
                    <p className="text-xs mt-1 opacity-70">
                      Zimmer {opt.numbers[0]} + Zimmer {opt.numbers[1]} · max. {opt.maxCapacity} Personen
                    </p>
                  </button>
                ))}
              </div>
            )}
            {fieldErrors.room_id && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.room_id}</p>
            )}
          </div>
        )}

        {conflictMsg && (
          <div className="mt-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
            {conflictMsg}
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="breakfast"
            checked={breakfast}
            onChange={e => setBreakfast(e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="breakfast" className="text-sm text-slate-700 cursor-pointer">
            Frühstück inklusive
          </label>
        </div>
      </section>

      {/* ── Quelle & Zahlung ─── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Quelle &amp; Zahlung
        </h2>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Buchungsquelle</label>
            <select value={source} onChange={e => setSource(e.target.value as ReservationSource)}
              className={cn(fieldClass('source'), 'cursor-pointer')}>
              {SOURCES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Zahlungsmethode</label>
            <select value={payMethod} onChange={e => setPayMethod(e.target.value as PaymentMethod)}
              className={cn(fieldClass('payment_method'), 'cursor-pointer')}>
              {PAYMENT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Zahlungsstatus</label>
            <select value={payStatus} onChange={e => setPayStatus(e.target.value as PaymentStatus)}
              className={cn(fieldClass('payment_status'), 'cursor-pointer')}>
              {PAYMENT_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Gesamtpreis (€)
            </label>
            <input type="number" min={0} step={0.01} value={totalPrice}
              onChange={e => setTotalPrice(e.target.value)}
              className={fieldClass('total_price')} placeholder="0.00" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Externe ID
              <span className="ml-1 text-slate-400 font-normal">(Booking.com / Expedia / etc.)</span>
            </label>
            <input type="text" value={extId}
              onChange={e => setExtId(e.target.value)}
              className={fieldClass('external_id')} placeholder="z.B. BDC-123456" />
          </div>
        </div>
      </section>

      {/* ── Notizen ─── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Notizen</label>
        <textarea rows={3} value={notes}
          onChange={e => setNotes(e.target.value)}
          className={cn(fieldClass('notes'), 'resize-none')}
          placeholder="Allergien, Sonderwünsche, Spätanreise…" />
      </section>

      {/* ── Absenden ─── */}
      {submitError && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          {submitError}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button type="button" onClick={() => router.back()}
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
          Abbrechen
        </button>
        <button type="submit" disabled={submitting || hasConflict}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {submitting ? 'Wird erstellt…' : 'Reservierung erstellen'}
        </button>
      </div>
    </form>
  )
}
