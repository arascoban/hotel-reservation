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
  getEligibleCategories,
  ReservationError,
} from '@/lib/reservations'
import type { AvailableRoom, ReservationSource, PaymentMethod, PaymentStatus } from '@/types/database'
import { cn } from '@/lib/cn'

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

  // ── Form state ──────────────────────────────────────────────
  const [guestName,   setGuestName]   = useState('')
  const [guestPhone,  setGuestPhone]  = useState('')
  const [guestEmail,  setGuestEmail]  = useState('')
  const [guestCount,  setGuestCount]  = useState(2)
  const [checkinDate, setCheckinDate] = useState(defaultCheckin  ?? '')
  const [checkoutDate,setCheckoutDate]= useState(defaultCheckout ?? '')
  const [roomId,      setRoomId]      = useState(defaultRoomId   ?? '')
  const [breakfast,   setBreakfast]   = useState(false)
  const [source,      setSource]      = useState<ReservationSource>('phone')
  const [payMethod,   setPayMethod]   = useState<PaymentMethod>('unpaid')
  const [payStatus,   setPayStatus]   = useState<PaymentStatus>('unpaid')
  const [totalPrice,  setTotalPrice]  = useState('')
  const [notes,       setNotes]       = useState('')
  const [extId,       setExtId]       = useState('')

  // ── UI state ────────────────────────────────────────────────
  const [availableRooms, setAvailableRooms]     = useState<AvailableRoom[]>([])
  const [loadingRooms,   setLoadingRooms]       = useState(false)
  const [conflictMsg,    setConflictMsg]         = useState<string | null>(null)
  const [fieldErrors,    setFieldErrors]         = useState<Record<string, string>>({})
  const [submitError,    setSubmitError]         = useState<string | null>(null)
  const [submitting,     setSubmitting]          = useState(false)

  // ── Selected room info ──────────────────────────────────────
  const selectedRoom = availableRooms.find(r => r.id === roomId) ?? null

  // ── Fetch available rooms when dates or guest count change ──
  const fetchAvailableRooms = useCallback(async () => {
    if (!checkinDate || !checkoutDate) return
    setLoadingRooms(true)
    setConflictMsg(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_available_rooms', {
      p_checkin_at:  buildCheckinTimestamp(checkinDate),
      p_checkout_at: buildCheckoutTimestamp(checkoutDate),
      p_guest_count: guestCount,
    })

    if (!error && data) {
      setAvailableRooms(data as AvailableRoom[])
      // If current roomId is no longer available, clear it
      if (roomId && !(data as AvailableRoom[]).find(r => r.id === roomId)) {
        setRoomId('')
      }
    }
    setLoadingRooms(false)
  }, [checkinDate, checkoutDate, guestCount, roomId, supabase])

  useEffect(() => {
    fetchAvailableRooms()
  }, [fetchAvailableRooms])

  // ── Pre-submit availability check when room is selected ────
  async function handleRoomChange(newRoomId: string) {
    setRoomId(newRoomId)
    setConflictMsg(null)
    if (!newRoomId || !checkinDate || !checkoutDate) return

    const result = await checkRoomAvailability(
      supabase,
      newRoomId,
      new Date(buildCheckinTimestamp(checkinDate)),
      new Date(buildCheckoutTimestamp(checkoutDate)),
    )
    if (!result.available) {
      const r = result.conflicting_reservation!
      setConflictMsg(
        `This room is already occupied from ${new Date(r.checkin_at).toLocaleDateString()} to ${new Date(r.checkout_at).toLocaleDateString()}.`,
      )
    }
  }

  // ── Submit ──────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    setConflictMsg(null)

    // Frontend validation
    const validation = validateReservationInput(
      {
        guest_name:   guestName,
        guest_email:  guestEmail || undefined,
        guest_phone:  guestPhone || undefined,
        room_id:      roomId,
        checkin_at:   checkinDate ? buildCheckinTimestamp(checkinDate) : undefined,
        checkout_at:  checkoutDate ? buildCheckoutTimestamp(checkoutDate) : undefined,
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
        checkin_at:         buildCheckinTimestamp(checkinDate),
        checkout_at:        buildCheckoutTimestamp(checkoutDate),
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
        if (err.message.includes('occupied')) setConflictMsg(err.message)
        else setSubmitError(err.message)
      } else {
        setSubmitError('An unexpected error occurred. Please try again.')
      }
      setSubmitting(false)
    }
  }

  // ── Helpers ─────────────────────────────────────────────────
  function fieldClass(name: string) {
    return cn(
      'w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
      fieldErrors[name] ? 'border-red-400 bg-red-50' : 'border-slate-300',
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Guest Information ─── */}
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
            className={fieldClass('guest_name')} placeholder="John Smith" />
          {fieldErrors.guest_name && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.guest_name}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
            <input type="tel" value={guestPhone}
              onChange={e => setGuestPhone(e.target.value)}
              className={fieldClass('guest_phone')} placeholder="+49 …" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input type="email" value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
              className={fieldClass('guest_email')} placeholder="guest@example.com" />
            {fieldErrors.guest_email && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.guest_email}</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Dates & Room ─── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Aufenthaltsdetails
        </h2>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Anreise <span className="text-red-500">*</span>
            </label>
            <input type="date" required value={checkinDate}
              onChange={e => setCheckinDate(e.target.value)}
              className={fieldClass('checkin_at')} />
            <p className="mt-1 text-2xs text-slate-400">Default 15:00</p>
            {fieldErrors.checkin_at && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.checkin_at}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Abreise <span className="text-red-500">*</span>
            </label>
            <input type="date" required value={checkoutDate}
              onChange={e => setCheckoutDate(e.target.value)}
              min={checkinDate}
              className={fieldClass('checkout_at')} />
            <p className="mt-1 text-2xs text-slate-400">Default 11:00</p>
            {fieldErrors.checkout_at && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.checkout_at}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Personen <span className="text-red-500">*</span>
            </label>
            <input type="number" min={1} max={4} required value={guestCount}
              onChange={e => setGuestCount(Number(e.target.value))}
              className={fieldClass('guest_count')} />
            {fieldErrors.guest_count && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.guest_count}</p>
            )}
          </div>
        </div>

        {/* Room selector */}
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
              <option value="">— Select a room —</option>
              {availableRooms.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} — {r.type_name} (max {r.max_capacity} guests)
                </option>
              ))}
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

          {conflictMsg && (
            <div className="mt-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {conflictMsg}
            </div>
          )}
        </div>

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

      {/* ── Booking Source & Payment ─── */}
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
              className={fieldClass('external_id')} placeholder="e.g. BDC-123456" />
          </div>
        </div>
      </section>

      {/* ── Notes ─── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Notizen</label>
        <textarea rows={3} value={notes}
          onChange={e => setNotes(e.target.value)}
          className={cn(fieldClass('notes'), 'resize-none')}
          placeholder="Allergien, Sonderwünsche, Spätanreise…" />
      </section>

      {/* ── Submit ─── */}
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
        <button type="submit" disabled={submitting || !!conflictMsg}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {submitting ? 'Wird erstellt…' : 'Reservierung erstellen'}
        </button>
      </div>
    </form>
  )
}
