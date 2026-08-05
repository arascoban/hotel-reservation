/**
 * Central customer helpers.
 *
 * `customers` is the single source of truth for guest contact + address data.
 * Every place that creates or edits a reservation routes through
 * findOrCreateCustomer() so an address typed on the calendar immediately
 * shows up on the Kunden page and in a later invoice.
 *
 * Matching strategy (deliberate):
 *   1. e-mail, case-insensitive — the only reliable identity signal
 *   2. exact name, case-insensitive — fallback for walk-ins with no e-mail
 * Anything fuzzier would merge two different guests who share a name, which
 * is far worse than having a duplicate. Duplicates can be cleaned up with the
 * merge_customers() RPC from the Kunden page.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface CustomerInput {
  name:      string
  email?:    string | null
  phone?:    string | null
  street?:   string | null
  postcode?: string | null
  city?:     string | null
  country?:  string | null
  source?:   string
}

/** Trim to a non-empty string, or null. */
function clean(v: string | null | undefined): string | null {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

/**
 * Find the matching customer (by e-mail, then name) or create one.
 * Existing records are *enriched*: only fields that are still empty get
 * filled, so data a staff member typed by hand is never overwritten.
 *
 * Returns the customer id, or null if the write failed (callers treat the
 * customer link as best-effort — a failure here must never block saving a
 * reservation).
 */
export async function findOrCreateCustomer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  input: CustomerInput,
): Promise<string | null> {
  const name = clean(input.name)
  if (!name) return null

  const email    = clean(input.email)
  const phone    = clean(input.phone)
  const street   = clean(input.street)
  const postcode = clean(input.postcode)
  const city     = clean(input.city)
  const country  = clean(input.country)

  try {
    // ── 1. Look for an existing record ──────────────────────────────────────
    let existing: Record<string, any> | null = null

    if (email) {
      const { data } = await supabase
        .from('customers').select('*').ilike('email', email).limit(1).maybeSingle()
      existing = data ?? null
    }
    if (!existing) {
      const { data } = await supabase
        .from('customers').select('*').ilike('name', name).limit(1).maybeSingle()
      existing = data ?? null
    }

    // ── 2. Enrich blanks on the existing record ─────────────────────────────
    if (existing) {
      const patch: Record<string, unknown> = {}
      if (!existing.email    && email)    patch.email    = email
      if (!existing.phone    && phone)    patch.phone    = phone
      if (!existing.street   && street)   patch.street   = street
      if (!existing.postcode && postcode) patch.postcode = postcode
      if (!existing.city     && city)     patch.city     = city
      if (!existing.country  && country)  patch.country  = country

      if (Object.keys(patch).length > 0) {
        await supabase.from('customers').update(patch).eq('id', existing.id)
      }
      return existing.id as string
    }

    // ── 3. Create a new record ──────────────────────────────────────────────
    const { data: created } = await supabase
      .from('customers')
      .insert({
        name, email, phone, street, postcode, city, country,
        source: input.source ?? 'reservation',
      })
      .select('id')
      .single()

    return (created?.id as string) ?? null
  } catch {
    // Best-effort: never block the reservation save on a customer write.
    return null
  }
}

/**
 * Push edited guest details from a reservation back onto its linked customer.
 * Unlike findOrCreateCustomer this *overwrites*, because the staff member is
 * explicitly editing the guest's details and expects them to stick.
 */
export async function syncCustomerFromReservation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  customerId: string,
  input: Omit<CustomerInput, 'source'>,
): Promise<void> {
  const patch: Record<string, unknown> = {}
  const name = clean(input.name)
  if (name) patch.name = name
  // Explicit edits win — including clearing a field.
  if (input.email    !== undefined) patch.email    = clean(input.email)
  if (input.phone    !== undefined) patch.phone    = clean(input.phone)
  if (input.street   !== undefined) patch.street   = clean(input.street)
  if (input.postcode !== undefined) patch.postcode = clean(input.postcode)
  if (input.city     !== undefined) patch.city     = clean(input.city)
  if (input.country  !== undefined) patch.country  = clean(input.country)

  if (Object.keys(patch).length === 0) return
  try {
    await supabase.from('customers').update(patch).eq('id', customerId)
  } catch { /* best-effort */ }
}
