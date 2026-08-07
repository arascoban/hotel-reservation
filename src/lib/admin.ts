export const ADMIN_EMAIL = 'arascoban36@gmail.com'

export function isAdminUser(email?: string | null): boolean {
  return email === ADMIN_EMAIL
}

/** Collapse multi-room bookings to a single row in list views.
 *
 *  Both family bookings (two connected rooms sold as one unit) and group
 *  bookings (one customer over N rooms) store one reservation per room so the
 *  calendar can block each of them. Lists should still show one entry.
 *  Also filters out soft-deleted reservations for non-admin users. */
export function deduplicateReservations<T extends {
  family_booking_id?: string | null
  group_booking_id?: string | null
  deleted_at?: string | null
}>(reservations: T[], isAdmin: boolean): T[] {
  const visible = isAdmin ? reservations : reservations.filter(r => !r.deleted_at)
  const seen = new Set<string>()
  return visible.filter(r => {
    const key = r.group_booking_id ?? r.family_booking_id
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
