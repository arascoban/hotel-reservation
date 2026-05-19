/**
 * iCal utility library.
 *
 * EXPORT: generateIcal() — builds a .ics feed from your reservations.
 *         Booking.com / Expedia / Airbnb fetch this URL to see blocked dates.
 *
 * IMPORT: parseIcal() — parses an external .ics feed from a platform.
 *         Your app fetches their URL and turns events into reservations.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IcalEvent {
  uid: string
  summary: string
  dtstart: Date      // check-in date
  dtend: Date        // check-out date
  description?: string
}

// ─── EXPORT: generate iCal from reservations ─────────────────────────────────

interface ReservationForExport {
  id: string
  guest_name: string
  checkin_at: string
  checkout_at: string
  created_at: string
  updated_at: string
}

export function generateIcal(
  roomName: string,
  reservations: ReservationForExport[],
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hotel Reception//Reservation System//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(roomName)}`,
  ]

  for (const res of reservations) {
    const checkin  = new Date(res.checkin_at)
    const checkout = new Date(res.checkout_at)

    lines.push(
      'BEGIN:VEVENT',
      `UID:${res.id}@hotel-reception`,
      `DTSTART;VALUE=DATE:${toIcalDate(checkin)}`,
      `DTEND;VALUE=DATE:${toIcalDate(checkout)}`,
      `SUMMARY:${escapeText(res.guest_name)}`,
      `CREATED:${toIcalDatetime(new Date(res.created_at))}`,
      `LAST-MODIFIED:${toIcalDatetime(new Date(res.updated_at))}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  // iCal standard requires CRLF line endings
  return lines.join('\r\n')
}

// ─── IMPORT: parse an external iCal feed ─────────────────────────────────────

export function parseIcal(content: string): IcalEvent[] {
  const events: IcalEvent[] = []

  // Normalize line endings and unfold continuation lines
  const normalized = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Unfold: lines starting with space/tab are continuations of the previous
    .replace(/\n[ \t]/g, '')

  const lines = normalized.split('\n')

  let inEvent = false
  let current: Partial<IcalEvent> & { uid?: string } = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true
      current = {}
      continue
    }

    if (trimmed === 'END:VEVENT') {
      if (current.uid && current.dtstart && current.dtend) {
        events.push({
          uid:         current.uid,
          summary:     current.summary ?? 'Blocked',
          dtstart:     current.dtstart,
          dtend:       current.dtend,
          description: current.description,
        })
      }
      inEvent = false
      current = {}
      continue
    }

    if (!inEvent) continue

    // Split on first colon only
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) continue

    const prop  = trimmed.substring(0, colonIdx)   // e.g. "DTSTART;VALUE=DATE"
    const value = trimmed.substring(colonIdx + 1).trim()

    // Extract base property name (before any semicolon parameters)
    const propName = prop.split(';')[0].toUpperCase()

    switch (propName) {
      case 'UID':
        current.uid = value
        break
      case 'SUMMARY':
        current.summary = unescapeText(value)
        break
      case 'DESCRIPTION':
        current.description = unescapeText(value)
        break
      case 'DTSTART':
        current.dtstart = parseIcalDate(prop, value)
        break
      case 'DTEND':
        current.dtend = parseIcalDate(prop, value)
        break
    }
  }

  return events
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** YYYYMMDD — date-only format used for DTSTART/DTEND VALUE=DATE */
function toIcalDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** YYYYMMDDTHHMMSSz — datetime format used for CREATED/LAST-MODIFIED */
function toIcalDatetime(d: Date): string {
  return d.toISOString().replace(/[-:.]/g, '').replace('000Z', 'Z').slice(0, 16) + 'Z'
}

/**
 * Parses both date-only (VALUE=DATE) and datetime formats.
 * Returns a UTC Date at midnight for date-only values.
 */
function parseIcalDate(prop: string, value: string): Date {
  const isDateOnly = prop.toUpperCase().includes('VALUE=DATE') || value.length === 8

  if (isDateOnly) {
    // YYYYMMDD → interpret as UTC midnight
    const y = parseInt(value.substring(0, 4), 10)
    const m = parseInt(value.substring(4, 6), 10) - 1
    const d = parseInt(value.substring(6, 8), 10)
    return new Date(Date.UTC(y, m, d))
  }

  // Datetime: YYYYMMDDTHHMMSS[Z]
  const clean = value
    .replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)/, '$1-$2-$3T$4:$5:$6$7')
  return new Date(clean)
}

// ─── Text escaping ────────────────────────────────────────────────────────────

function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g,  '\\;')
    .replace(/,/g,  '\\,')
    .replace(/\n/g, '\\n')
}

function unescapeText(text: string): string {
  return text
    .replace(/\\n/g,  '\n')
    .replace(/\\,/g,  ',')
    .replace(/\\;/g,  ';')
    .replace(/\\\\/g, '\\')
}
