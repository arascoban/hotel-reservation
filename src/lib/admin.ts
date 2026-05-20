export const ADMIN_EMAIL = 'arascoban36@gmail.com'

export function isAdminUser(email?: string | null): boolean {
  return email === ADMIN_EMAIL
}

/** Deduplicate family bookings — show only the first reservation per family_booking_id.
 *  Also filters out soft-deleted reservations for non-admin users. */
export function deduplicateReservations<T extends {
  family_booking_id?: string | null
  deleted_at?: string | null
}>(reservations: T[], isAdmin: boolean): T[] {
  const visible = isAdmin ? reservations : reservations.filter(r => !r.deleted_at)
  const seen = new Set<string>()
  return visible.filter(r => {
    if (!r.family_booking_id) return true
    if (seen.has(r.family_booking_id)) return false
    seen.add(r.family_booking_id)
    return true
  })
}
