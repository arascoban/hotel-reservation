/**
 * Reservation conflict detection and validation helpers.
 * These run on the client and server (Next.js API routes / Server Actions).
 * The database EXCLUDE constraint is the authoritative safety net.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReservationSource =
  | 'booking_com' | 'expedia' | 'airbnb'
  | 'walk_in' | 'phone' | 'website' | 'other'

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

  const { data, error } = await supabase.rpc('create_reservation', {
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
    errors.guest_name = 'Guest name is required.'
  }

  if (!input.room_id) {
    errors.room_id = 'Please select a room.'
  }

  if (!input.checkin_at) {
    errors.checkin_at = 'Check-in date is required.'
  }

  if (!input.checkout_at) {
    errors.checkout_at = 'Check-out date is required.'
  }

  if (input.checkin_at && input.checkout_at) {
    const checkin  = new Date(input.checkin_at)
    const checkout = new Date(input.checkout_at)
    if (checkout <= checkin) {
      errors.checkout_at = 'Check-out must be after check-in.'
    }
  }

  if (!input.guest_count || input.guest_count < 1) {
    errors.guest_count = 'Number of guests must be at least 1.'
  } else if (roomMaxCapacity !== undefined && input.guest_count > roomMaxCapacity) {
    errors.guest_count = `This room can accommodate at most ${roomMaxCapacity} guest${roomMaxCapacity !== 1 ? 's' : ''}.`
  }

  if (input.guest_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.guest_email)) {
    errors.guest_email = 'Please enter a valid email address.'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// ─── Date/Time Helpers ────────────────────────────────────────────────────────

/** Hotel check-in time (local): 15:00 */
export const DEFAULT_CHECKIN_HOUR  = 15
/** Hotel check-out time (local): 11:00 */
export const DEFAULT_CHECKOUT_HOUR = 11

/**
 * Builds a full checkin timestamp from a date string.
 * Uses the hotel's default check-in time (15:00) in the given timezone.
 */
export function buildCheckinTimestamp(date: string, timezoneOffset = '+02:00'): string {
  return `${date}T${String(DEFAULT_CHECKIN_HOUR).padStart(2, '0')}:00:00${timezoneOffset}`
}

/**
 * Builds a full checkout timestamp from a date string.
 * Uses the hotel's default check-out time (11:00) in the given timezone.
 */
export function buildCheckoutTimestamp(date: string, timezoneOffset = '+02:00'): string {
  return `${date}T${String(DEFAULT_CHECKOUT_HOUR).padStart(2, '0')}:00:00${timezoneOffset}`
}

/** Formats a timestamp for display: "19 May 2026, 15:00" */
export function formatReservationDate(isoString: string): string {
  return new Date(isoString).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
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

// ─── Source Color Mapping ─────────────────────────────────────────────────────

/** Returns the Tailwind CSS background color class for a reservation source. */
export function getSourceColor(source: ReservationSource): string {
  const colors: Record<ReservationSource, string> = {
    booking_com: 'bg-blue-500',
    expedia:     'bg-purple-500',
    airbnb:      'bg-red-500',
    walk_in:     'bg-green-500',
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
    walk_in:     'Walk-in',
    phone:       'Phone',
    website:     'Website',
    other:       'Other',
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
    return 'This room is already occupied for the selected dates.'
  }
  if (raw.includes('exceeds maximum capacity')) {
    return 'The number of guests exceeds this room\'s maximum capacity.'
  }
  if (raw.includes('not currently active')) {
    return 'This room is not currently available.'
  }
  if (raw.includes('checkout_at must be after')) {
    return 'Check-out date must be after the check-in date.'
  }
  return 'An unexpected error occurred. Please try again.'
}
