/**
 * Turn a booking into an invoice.
 *
 * The document itself is unchanged — this only fills the same fields the
 * invoice form would have filled by hand, claims the next number and links
 * the invoice to the booking. Once created it is an ordinary invoice: edit it
 * under Rechnungen like any other. Invoices that already exist are never
 * touched; a booking that has one is handed back instead of billed twice.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { collapseBookingUnits, FAMILY_TYPE_NAME } from './reservations'
import { buildRecipient, type BillTo } from './recipient'

/** Breakfast is billed per person and night and split out of the room price. */
export const BREAKFAST_PRICE_PER_PERSON = 10

/**
 * Breakfast carries the standard rate — only the overnight stay itself gets
 * the reduced 7 % (Aufteilungsgebot). Stored per invoice so an issued one
 * keeps the rate it was written with.
 */
export const BREAKFAST_VAT_RATE = 19

export interface InvoiceRef {
  id: string
  invoice_number: number
}

export interface InvoiceLineRoom {
  room_number: string
  room_name:   string
  checkin_at:  string
  checkout_at: string
  nights:      number
  adults:      number
  children:    number
  price:       number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>

function nightsBetween(from: string, to: string): number {
  return Math.max(1, Math.round(
    (new Date(to).getTime() - new Date(from).getTime()) / 86400000,
  ))
}

/** Every reservation row of the booking `reservationId` belongs to. */
export async function loadBookingRows(supabase: DB, reservationId: string): Promise<any[]> {
  const cols = 'id, family_booking_id, group_booking_id, customer_id, bill_to, salutation, ' +
    'guest_name, guest_email, guest_street, guest_postcode, guest_city, guest_country, ' +
    'checkin_at, checkout_at, guest_count, child_count, total_price, breakfast_included, ' +
    'payment_method, notes, rooms(name, room_number, room_types(name))'

  const { data: one } = await supabase
    .from('reservations').select(cols).eq('id', reservationId).maybeSingle()
  if (!one) return []

  const r = one as any
  if (!r.group_booking_id && !r.family_booking_id) return [r]

  const q = supabase.from('reservations').select(cols).is('deleted_at', null).order('checkin_at')
  const { data } = r.group_booking_id
    ? await q.eq('group_booking_id',  r.group_booking_id)
    : await q.eq('family_booking_id', r.family_booking_id)
  return (data ?? []) as any[]
}

/**
 * The invoice already issued for this booking, if any.
 *
 * A group or family booking spans several reservations, so match on the
 * booking ids too — otherwise opening it from a different room of the same
 * group would look unbilled and issue a second invoice.
 */
export async function findInvoiceForBooking(supabase: DB, rows: any[]): Promise<InvoiceRef | null> {
  if (rows.length === 0) return null
  const ids      = rows.map(r => r.id)
  const groupId  = rows[0].group_booking_id  ?? null
  const familyId = rows[0].family_booking_id ?? null

  const filters = [`reservation_id.in.(${ids.join(',')})`]
  if (groupId)  filters.push(`group_booking_id.eq.${groupId}`)
  if (familyId) filters.push(`family_booking_id.eq.${familyId}`)

  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number')
    .or(filters.join(','))
    .order('invoice_number', { ascending: false })
    .limit(1)

  const hit = (data ?? [])[0]
  return hit ? { id: hit.id as string, invoice_number: hit.invoice_number as number } : null
}

/**
 * Create the invoice for a booking, or return the one it already has.
 *
 * `existed: true` means nothing was written — the caller should open that
 * invoice instead of creating another one.
 */
export async function createInvoiceFromReservation(
  supabase: DB,
  reservationId: string,
  createdBy?: string | null,
): Promise<{ invoice: InvoiceRef; existed: boolean }> {
  const rows = await loadBookingRows(supabase, reservationId)
  if (rows.length === 0) throw new Error('Reservierung nicht gefunden.')

  const existing = await findInvoiceForBooking(supabase, rows)
  if (existing) return { invoice: existing, existed: true }

  const first = rows[0]

  // A connecting-door family pair is two reservations but one room, and both
  // rows carry its occupancy and price — collapse before totalling.
  const units = collapseBookingUnits(rows as { id: string; family_booking_id: string | null }[]) as
    { rows: any[]; isFamily: boolean }[]
  const hasFamily = units.some(u => u.isFamily)

  let familyTypeName = FAMILY_TYPE_NAME
  if (hasFamily) {
    const { data: ft } = await supabase
      .from('room_types').select('name').eq('category', 'family_connecting').maybeSingle()
    familyTypeName = (ft as { name?: string } | null)?.name ?? FAMILY_TYPE_NAME
  }

  // One line per room the guest booked.
  const lines: InvoiceLineRoom[] = units.map(u => {
    const r = u.rows[0]
    return {
      room_number: u.rows.map((x: any) => x.rooms?.room_number ?? '').filter(Boolean).join(' + '),
      room_name:   u.isFamily ? familyTypeName : (r.rooms?.room_types?.name ?? r.rooms?.name ?? ''),
      checkin_at:  r.checkin_at,
      checkout_at: r.checkout_at,
      nights:      nightsBetween(r.checkin_at, r.checkout_at),
      adults:      (r.guest_count ?? 1) - (r.child_count ?? 0),
      children:    r.child_count ?? 0,
      price:       r.total_price ?? 0,
    }
  })

  const stayFrom = rows.reduce((min, r) => (r.checkin_at  < min ? r.checkin_at  : min), rows[0].checkin_at)
  const stayTo   = rows.reduce((max, r) => (r.checkout_at > max ? r.checkout_at : max), rows[0].checkout_at)
  const total    = lines.reduce((s, l) => s + l.price, 0)
  const adults   = lines.reduce((s, l) => s + l.adults, 0)
  const children = lines.reduce((s, l) => s + l.children, 0)
  // Breakfast is one flag on the invoice, so only claim it when every room has
  // it — billing a room that did not book it would overcharge the guest.
  const breakfast = rows.every(r => r.breakfast_included)

  // The recipient: the guest, or the company they booked for.
  let customer: any = null
  if (first.customer_id) {
    const { data: c } = await supabase
      .from('customers')
      .select('company_name, vat_id, company_street, company_postcode, company_city, company_country')
      .eq('id', first.customer_id).maybeSingle()
    customer = c ?? null
  }
  const recipient = buildRecipient({
    name:     first.guest_name,
    street:   first.guest_street,
    postcode: first.guest_postcode,
    city:     first.guest_city,
    country:  first.guest_country,
    companyName:     customer?.company_name,
    vatId:           customer?.vat_id,
    companyStreet:   customer?.company_street,
    companyPostcode: customer?.company_postcode,
    companyCity:     customer?.company_city,
    companyCountry:  customer?.company_country,
  }, (first.bill_to ?? 'person') as BillTo)

  const isMultiRoom = lines.length > 1 || hasFamily

  const { data: num, error: numErr } = await supabase.rpc('get_next_invoice_number')
  if (numErr) throw new Error('Rechnungsnummer konnte nicht vergeben werden.')

  const payload: Record<string, unknown> = {
    invoice_number:     num as number,
    reservation_id:     first.id,
    group_booking_id:   first.group_booking_id  ?? null,
    family_booking_id:  first.family_booking_id ?? null,
    salutation:         first.salutation ?? null,
    bill_to:            first.bill_to ?? 'person',
    company_name:       customer?.company_name ?? null,
    vat_id:             customer?.vat_id ?? null,
    guest_name:         recipient.name || first.guest_name,
    guest_email:        first.guest_email ?? null,
    guest_address:      recipient.lines.join('\n') || null,
    // A multi-room booking bills through group_rooms; room_number/room_name
    // stay filled because the columns are NOT NULL and the list shows them.
    room_number:        isMultiRoom ? lines.map(l => l.room_number).join(', ') : lines[0].room_number,
    room_name:          isMultiRoom ? `${lines.length} Zimmer` : lines[0].room_name,
    group_rooms:        isMultiRoom ? lines : null,
    checkin_at:         stayFrom,
    checkout_at:        stayTo,
    nights:             nightsBetween(stayFrom, stayTo),
    total_price:        total,
    payment_method:     first.payment_method ?? 'cash',
    breakfast_included: breakfast,
    guest_count:        adults,
    child_count:        children,
    breakfast_price_per_person: BREAKFAST_PRICE_PER_PERSON,
    breakfast_vat_rate:         BREAKFAST_VAT_RATE,
    room_service_total: 0,
    discount:           0,
    notes:              first.notes ?? null,
    line_items:         [],
    created_by:         createdBy ?? null,
    created_at:         new Date().toISOString(),
  }

  const { data: inv, error } = await supabase
    .from('invoices').insert(payload).select('id, invoice_number').single()
  if (error) throw new Error(error.message)

  // Money already taken on the booking belongs to this invoice, so it stays on
  // the document even if the reservation is deleted later.
  await supabase.from('payments')
    .update({ invoice_id: (inv as any).id })
    .in('reservation_id', rows.map(r => r.id))
    .is('invoice_id', null)

  return { invoice: inv as unknown as InvoiceRef, existed: false }
}
