/**
 * Address helpers — shared between the Booking.com import flow and the
 * central customer records.
 *
 * Booking.com exports the guest address as one free-text string with no
 * consistent shape. Common variants:
 *   "Ruhrstraße 14, 63452 Hanau, Germany"
 *   "Ruhrstraße 14, Hanau, 63452, Deutschland"
 *   "Ruhrstraße 14"
 *   ""                          ← very often empty
 *
 * parseAddress() makes a best-effort split so the staff sees the fields
 * pre-filled instead of having to retype them. Every field stays editable —
 * a wrong guess costs one correction, a missing guess costs full retyping.
 */

export interface StructuredAddress {
  street:   string
  postcode: string
  city:     string
  country:  string
}

export const EMPTY_ADDRESS: StructuredAddress = {
  street: '', postcode: '', city: '', country: '',
}

/** Postcodes we care about: 4–6 digits, optionally prefixed with a country code (D-37539). */
const POSTCODE_RE = /^(?:[A-Z]{1,2}-)?(\d{4,6})$/i
/** "63452 Hanau" / "D-37539 Bad Grund" — postcode followed by a city name. */
const POSTCODE_CITY_RE = /^(?:[A-Z]{1,2}-)?(\d{4,6})\s+(.+)$/i

/** Countries Booking.com commonly sends, so we can recognise a trailing country part. */
const COUNTRY_HINTS = [
  'deutschland', 'germany', 'österreich', 'osterreich', 'austria', 'schweiz',
  'switzerland', 'niederlande', 'netherlands', 'holland', 'belgien', 'belgium',
  'frankreich', 'france', 'italien', 'italy', 'spanien', 'spain', 'polen',
  'poland', 'tschechien', 'czechia', 'czech republic', 'dänemark', 'denmark',
  'türkei', 'turkey', 'türkiye', 'vereinigtes königreich', 'united kingdom',
  'uk', 'usa', 'united states', 'luxemburg', 'luxembourg',
]

function isCountry(part: string): boolean {
  return COUNTRY_HINTS.includes(part.trim().toLowerCase())
}

/**
 * Best-effort split of a free-text address into structured fields.
 * Anything that cannot be classified confidently stays in `street`, so no
 * information is ever silently dropped.
 */
export function parseAddress(raw: string | null | undefined): StructuredAddress {
  const text = (raw ?? '').trim()
  if (!text) return { ...EMPTY_ADDRESS }

  // Split on commas (or newlines, which some exports use instead)
  const parts = text.split(/[,\n]/).map(p => p.trim()).filter(Boolean)
  if (parts.length === 0) return { ...EMPTY_ADDRESS }

  const out: StructuredAddress = { ...EMPTY_ADDRESS }
  const rest: string[] = []

  // Trailing country, if present
  if (parts.length > 1 && isCountry(parts[parts.length - 1])) {
    out.country = parts.pop()!.trim()
  }

  for (const part of parts) {
    const pcOnly = part.match(POSTCODE_RE)
    if (pcOnly && !out.postcode) { out.postcode = pcOnly[1]; continue }

    const pcCity = part.match(POSTCODE_CITY_RE)
    if (pcCity && !out.postcode) {
      out.postcode = pcCity[1]
      out.city     = pcCity[2].trim()
      continue
    }
    rest.push(part)
  }

  // First remaining part is the street; a second one is the city (when the
  // postcode arrived separately, e.g. "Street, City, 63452, Germany").
  if (rest.length > 0) out.street = rest[0]
  if (rest.length > 1 && !out.city) out.city = rest[1]
  // Anything still unclaimed is appended to the street so nothing is lost.
  if (rest.length > 2) out.street = [out.street, ...rest.slice(2)].filter(Boolean).join(', ')

  return out
}

/** Join structured fields back into the multi-line string used by invoices. */
export function formatAddress(a: Partial<StructuredAddress>): string {
  return [
    a.street?.trim(),
    [a.postcode?.trim(), a.city?.trim()].filter(Boolean).join(' '),
    a.country?.trim(),
  ].filter(Boolean).join('\n')
}

/** True when at least one address field carries content. */
export function hasAddress(a: Partial<StructuredAddress>): boolean {
  return !!(a.street?.trim() || a.postcode?.trim() || a.city?.trim() || a.country?.trim())
}
