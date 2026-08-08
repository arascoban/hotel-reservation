/**
 * Reservation conflict detection and validation helpers.
 * These run on the client and server (Next.js API routes / Server Actions).
 * The database EXCLUDE constraint is the authoritative safety net.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReservationSource =
  | 'booking_com' | 'expedia' | 'airbnb'
  | 'walk_in' | 'phone' | 'email' | 'website' | 'other'

export type PaymentMethod = 'cash' | 'ec_card' | 'credit_card' | 'online' | 'unpaid'
export type PaymentStatus = 'paid' | 'deposit_paid' | 'unpaid' | 'refunded'
export type ReservationStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show'
export type RoomTypeCategory = 'single' | 'double' | 'double_sofa' | 'family_double' | 'family_single'

export interface RoomType {
  id: string
  category: RoomTypeCategory
  name: string
  base_capacity: number
  max_capacity: number
  sort_order: number
}

export interface Room {
  id: string
  room_type_id: string
  room_number: string
  name: string
  floor: number | null
  is_active: boolean
  sort_order: number
  room_types: RoomType
}

export interface Reservation {
  id: string
  room_id: string
  guest_name: string
  guest_email: string | null
  guest_phone: string | null
  checkin_at: string   // ISO 8601 string from DB
  checkout_at: string
  guest_count: number
  breakfast_included: boolean
  source: ReservationSource
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  status: ReservationStatus
  total_price: number | null
  notes: string | null
  external_id: string | null
  created_at: string
  updated_at: string
}

export interface CreateReservationInput {
  guest_name: string
  guest_email?: string
  guest_phone?: string
  room_id: string
  checkin_at: Date | string
  checkout_at: Date | string
  guest_count: number
  breakfast_included?: boolean
  source?: ReservationSource
  payment_method?: PaymentMethod
  payment_status?: PaymentStatus
  status?: ReservationStatus
  total_price?: number
  notes?: string
  external_id?: string
}

export interface ConflictCheckResult {
  available: boolean
  conflicting_reservation?: Pick<Reservation, 'id' | 'guest_name' | 'checkin_at' | 'checkout_at' | 'status'>
}

// ─── Overlap Detection (pure function, no DB) ─────────────────────────────────

/**
 * Returns true if two date ranges overlap using the business rule:
 *   new_checkin < existing_checkout  AND  new_checkout > existing_checkin
 *
 * Allows same-day checkout (11:00) + check-in (15:00) because 15:00 > 11:00.
 */
export function doRangesOverlap(
  newCheckin: Date,
  newCheckout: Date,
  existingCheckin: Date,
  existingCheckout: Date,
): boolean {
  return newCheckin < existingCheckout && newCheckout > existingCheckin
}

// ─── Client-side Availability Check ──────────────────────────────────────────

/**
 * Checks whether a room is available for the given period.
 * Queries the DB directly — use before showing the form or submitting.
 * The DB EXCLUDE constraint will catch any race conditions.
 *
 * @param excludeReservationId  Exclude this reservation ID when editing an existing one.
 */
export async function checkRoomAvailability(
  supabase: SupabaseClient,
  roomId: string,
  checkinAt: Date,
  checkoutAt: Date,
  excludeReservationId?: string,
): Promise<ConflictCheckResult> {
  const { data, error } = await supabase
    .from('reservations')
    .select('id, guest_name, checkin_at, checkout_at, status')
    .eq('room_id', roomId)
    .not('status', 'in', '("cancelled","no_show")')
    .is('deleted_at', null)  // soft-deleted don't block availability
    .neq('id', excludeReservationId ?? '00000000-0000-0000-0000-000000000000')
    .lt('checkin_at', checkoutAt.toISOString())
    .gt('checkout_at', checkinAt.toISOString())
    .limit(1)

  if (error) throw new Error(`Availability check failed: ${error.message}`)

  if (data && data.length > 0) {
    return { available: false, conflicting_reservation: data[0] as ConflictCheckResult['conflicting_reservation'] }
  }

  return { available: true }
}

// ─── RPC-based Safe Creation ──────────────────────────────────────────────────

/** Room type name of a connecting-door pair, when the DB value is not at hand. */
export const FAMILY_TYPE_NAME = 'Familienzimmer mit Verbindungstür'

/** One room as the guest booked it: a single room, or a connecting-door pair. */
export interface BookingUnit<T> {
  /** The unit's reservations — one row, or the two rooms of a family pair. */
  rows: T[]
  isFamily: boolean
}

/**
 * Collapse reservation rows into the rooms the guest actually booked.
 *
 * A family unit is stored as one reservation per physical room and *both* rows
 * carry the whole unit's occupancy and price. Summing the raw rows therefore
 * counts a family unit twice and presents it as two separate Doppelzimmer —
 * so anything that totals or lists a booking has to collapse first.
 */
export function collapseBookingUnits<T extends { id: string; family_booking_id?: string | null }>(
  rows: T[],
): BookingUnit<T>[] {
  const byKey = new Map<string, T[]>()
  for (const r of rows) {
    const key = r.family_booking_id ?? r.id
    const list = byKey.get(key)
    if (list) list.push(r)
    else byKey.set(key, [r])
  }
  return [...byKey.values()].map(rs => ({ rows: rs, isFamily: !!rs[0].family_booking_id }))
}

/**
 * Guest count a single room of a connecting-door family unit may be created with.
 *
 * A family unit (11+12, 19+20, 21+22) is sold as one room but stored as one
 * reservation per physical room, each carrying the whole unit's occupancy —
 * that is the convention every list, invoice and e-mail already relies on.
 * `create_reservation` and `update_reservation` validate the guest count
 * against the *physical* room's type, which knows nothing about the pair, so
 * 3 people in 21+22 fail on Zimmer 21 (Doppelzimmer, max. 2) and 2 people
 * already fail on Zimmer 22 (Einzelzimmer, max. 1).
 *
 * Hand the RPC a count the room can hold and write the unit's real occupancy
 * in the follow-up update. The ceiling that matters — the family type's — is
 * enforced in the form before anything is written.
 *
 * For a normal single-room booking this returns the count unchanged.
 */
export function capacitySafeCount(unitCount: number, roomCapacity: number | null | undefined): number {
  return Math.max(1, Math.min(unitCount, roomCapacity || 1))
}

/**
 * Creates a reservation via the Supabase RPC function `create_reservation`.
 * This is atomic and protected by the DB EXCLUDE constraint.
 *
 * Returns the new reservation UUID on success.
 * Throws a structured error on failure.
 */
export async function createReservationSafe(
  supabase: SupabaseClient,
  input: CreateReservationInput,
): Promise<string> {
  const checkinAt  = new Date(input.checkin_at)
  const checkoutAt = new Date(input.checkout_at)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('create_reservation', {
    p_guest_name:     input.guest_name,
    p_guest_email:    input.guest_email   ?? null,
    p_guest_phone:    input.guest_phone   ?? null,
    p_room_id:        input.room_id,
    p_checkin_at:     checkinAt.toISOString(),
    p_checkout_at:    checkoutAt.toISOString(),
    p_guest_count:    input.guest_count,
    p_breakfast:      input.breakfast_included ?? false,
    p_source:         input.source         ?? 'other',
    p_payment_method: input.payment_method ?? 'unpaid',
    p_payment_status: input.payment_status ?? 'unpaid',
    p_status:         input.status         ?? 'confirmed',
    p_total_price:    input.total_price    ?? null,
    p_notes:          input.notes          ?? null,
    p_external_id:    input.external_id    ?? null,
  })

  if (error) {
    throw new ReservationError(mapDbError(error.message), error.message)
  }

  return data as string
}

// ─── Form Validation ──────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean
  errors: Record<string, string>
}

/**
 * Validates reservation form input before calling the API.
 * Does NOT check DB availability — that's done separately.
 */
export function validateReservationInput(
  input: Partial<CreateReservationInput>,
  roomMaxCapacity?: number,
): ValidationResult {
  const errors: Record<string, string> = {}

  if (!input.guest_name?.trim()) {
    errors.guest_name = 'Name des Gastes ist erforderlich.'
  }

  if (!input.room_id) {
    errors.room_id = 'Bitte ein Zimmer auswählen.'
  }

  if (!input.checkin_at) {
    errors.checkin_at = 'Anreisedatum ist erforderlich.'
  }

  if (!input.checkout_at) {
    errors.checkout_at = 'Abreisedatum ist erforderlich.'
  }

  if (input.checkin_at && input.checkout_at) {
    const checkin  = new Date(input.checkin_at)
    const checkout = new Date(input.checkout_at)
    if (checkout <= checkin) {
      errors.checkout_at = 'Abreise muss nach der Anreise liegen.'
    }
  }

  if (!input.guest_count || input.guest_count < 1) {
    errors.guest_count = 'Mindestens 1 Person erforderlich.'
  } else if (roomMaxCapacity !== undefined && input.guest_count > roomMaxCapacity) {
    errors.guest_count = `Dieses Zimmer hat eine maximale Kapazität von ${roomMaxCapacity} Person${roomMaxCapacity !== 1 ? 'en' : ''}.`
  }

  if (input.guest_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.guest_email)) {
    errors.guest_email = 'Bitte eine gültige E-Mail-Adresse eingeben.'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// ─── Date/Time Helpers ────────────────────────────────────────────────────────

/** Hotel check-in time (local): 13:00 */
export const DEFAULT_CHECKIN_HOUR  = 13
/** Hotel check-out time (local): 12:00 */
export const DEFAULT_CHECKOUT_HOUR = 12

export const HOTEL_TZ = 'Europe/Berlin'

/**
 * UTC offset the hotel is on for a given local date — "+01:00" or "+02:00".
 *
 * These timestamps used to be written with a hard-coded "+02:00". That is only
 * right in summer: a 13:00 check-in in December was stored as 13:00+02:00, so
 * every screen that converts to local time showed 12:00, and saving again
 * pushed it another hour. Ask the calendar instead of assuming.
 */
export function hotelOffset(date: string, time: string): string {
  // Probe the wall time as if it were UTC. Berlin switches at 01:00 UTC, so
  // for the times a hotel actually uses this always lands on the right side.
  const probe = new Date(`${date}T${time}:00Z`)
  if (Number.isNaN(probe.getTime())) return '+01:00'
  const name = new Intl.DateTimeFormat('en-US', { timeZone: HOTEL_TZ, timeZoneName: 'longOffset' })
    .formatToParts(probe).find(p => p.type === 'timeZoneName')?.value
  return name?.match(/GMT([+-]\d{2}:\d{2})/)?.[1] ?? '+01:00'
}

/**
 * The check-in/check-out time as the hotel sees it — always Europe/Berlin.
 *
 * Never format a stored timestamp with `new Date()` + a local formatter: the
 * invoice renders on the server, which runs in UTC, so a 13:00 check-in came
 * out as 11:00. Pinning the zone makes the output the same everywhere,
 * whatever offset the database hands back.
 */
export function storedTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: HOTEL_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}

/** Same, as "10.12.2026". */
export function storedDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: HOTEL_TZ, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d)
}

/** "yyyy-MM-dd" in the hotel's zone — for date inputs. */
export function storedDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: HOTEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
  return p
}

/**
 * Builds a full check-in timestamp from a date string.
 * @param date   yyyy-MM-dd date string
 * @param time   Optional HH:MM override (e.g. '14:30'). Falls back to DEFAULT_CHECKIN_HOUR.
 */
export function buildCheckinTimestamp(date: string, time?: string, timezoneOffset?: string): string {
  const t = time ?? `${String(DEFAULT_CHECKIN_HOUR).padStart(2, '0')}:00`
  return `${date}T${t}:00${timezoneOffset ?? hotelOffset(date, t)}`
}

/**
 * Builds a full check-out timestamp from a date string.
 * @param date   yyyy-MM-dd date string
 * @param time   Optional HH:MM override (e.g. '10:00'). Falls back to DEFAULT_CHECKOUT_HOUR.
 */
export function buildCheckoutTimestamp(date: string, time?: string, timezoneOffset?: string): string {
  const t = time ?? `${String(DEFAULT_CHECKOUT_HOUR).padStart(2, '0')}:00`
  return `${date}T${t}:00${timezoneOffset ?? hotelOffset(date, t)}`
}

/** Formats an ISO string as DD/MM/YYYY in the hotel's zone. */
export function formatDate(isoString: string): string {
  return storedDate(isoString).replace(/\./g, '/')
}

/** Formats an ISO string as DD/MM/YYYY HH:MM in the hotel's zone. */
export function formatDateTime(isoString: string): string {
  return `${formatDate(isoString)} ${storedTime(isoString)}`
}

/** @deprecated Use formatDateTime instead */
export function formatReservationDate(isoString: string): string {
  return formatDateTime(isoString)
}

// ─── Room Filtering ───────────────────────────────────────────────────────────

/**
 * Returns room type categories eligible for a given guest count.
 * Used to filter the room dropdown and the availability query.
 */
export function getEligibleCategories(guestCount: number): RoomTypeCategory[] {
  if (guestCount === 1) return ['single', 'double', 'double_sofa', 'family_double', 'family_single']
  if (guestCount === 2) return ['double', 'double_sofa', 'family_double', 'family_single']
  if (guestCount === 3) return ['double_sofa', 'family_double', 'family_single']
  if (guestCount >= 4) return ['family_double']
  return []
}

// ─── Room Floor Mapping ───────────────────────────────────────────────────────

/**
 * Returns the floor/wing label for a given room number.
 * 21–24 → 4. Etage, 15–20 → 3. Etage, 11/12/14 → 2. Etage,
 * 10 → 1. Etage, 04/05 → Pension
 */
export function getRoomFloor(roomNumber: string): string {
  const n = parseInt(roomNumber, 10)
  if ([21, 22, 23, 24].includes(n))           return '4. Etage'
  if ([15, 16, 17, 18, 19, 20].includes(n))   return '3. Etage'
  if ([11, 12, 14].includes(n))               return '2. Etage'
  if (n === 10)                               return '1. Etage'
  if (roomNumber === '04' || roomNumber === '05') return 'Pension'
  return ''
}

// ─── Source Color Mapping ─────────────────────────────────────────────────────

/** Returns the Tailwind CSS background color class for a reservation source. */
export function getSourceColor(source: ReservationSource): string {
  const colors: Record<ReservationSource, string> = {
    booking_com: 'bg-blue-500',
    expedia:     'bg-purple-500',
    airbnb:      'bg-red-500',
    walk_in:     'bg-green-500',
    email:       'bg-sky-500',
    phone:       'bg-yellow-500',
    website:     'bg-orange-500',
    other:       'bg-gray-400',
  }
  return colors[source] ?? 'bg-gray-400'
}

export function getSourceLabel(source: ReservationSource): string {
  const labels: Record<ReservationSource, string> = {
    booking_com: 'Booking.com',
    expedia:     'Expedia',
    airbnb:      'Airbnb',
    walk_in:     'Laufkundschaft',
    email:       'E-Mail',
    phone:       'Telefon',
    website:     'Website',
    other:       'Sonstige',
  }
  return labels[source] ?? source
}

// ─── Error Handling ───────────────────────────────────────────────────────────

export class ReservationError extends Error {
  constructor(
    message: string,
    public readonly rawMessage?: string,
  ) {
    super(message)
    this.name = 'ReservationError'
  }
}

function mapDbError(raw: string): string {
  if (raw.includes('already occupied') || raw.includes('exclusion_violation') || raw.includes('no_overlap')) {
    return 'Dieses Zimmer ist für die gewählten Daten bereits belegt.'
  }
  if (raw.includes('exceeds maximum capacity')) {
    return 'Die Personenzahl überschreitet die Zimmerkapazität.'
  }
  if (raw.includes('not currently active')) {
    return 'Dieses Zimmer ist derzeit nicht verfügbar.'
  }
  if (raw.includes('checkout_at must be after')) {
    return 'Abreisedatum muss nach dem Anreisedatum liegen.'
  }
  return 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.'
}
