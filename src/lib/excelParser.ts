// ── Booking.com Excel (.xls/.xlsx) Parser ────────────────────────────────
// Column indices are 0-based and match the booking.com export format.

export type DbCategory = 'single' | 'double' | 'double_sofa' | 'family' | 'unknown'

export interface ExcelRow {
  bookingNumber: string
  guestName: string
  checkin: string        // YYYY-MM-DD
  checkout: string       // YYYY-MM-DD
  adults: number
  children: number
  childrenAges: string   // e.g. "12, 14" or ""
  totalPrice: number | null
  commission: number | null
  paymentStatus: string  // raw from col 15
  paymentMethod: string  // raw from col 16
  notes: string          // Bemerkungen (col 17) — shown as guest notes
  adresse: string        // col 24 — for future invoice
  roomTypeRaw: string    // Art der Wohneinheit (col 21)
  zimmerAnzahl: number   // col 7 — number of rooms in this booking
  dbCategory: DbCategory
  isFamily: boolean
  // After splitting multi-room bookings, each split gets its own entry:
  splitIndex: number     // 0-based index within the split
  splitTotal: number     // total rooms in the original booking
  splitRoomCategory: DbCategory
}

// ── Column indices ────────────────────────────────────────────────────────

const C = {
  buchungsnummer:  0,
  gastname:        2,
  anreise:         3,
  abreise:         4,
  zimmerAnzahl:    7,
  erwachsene:      9,
  kinder:          10,
  kinderAlter:     11,
  preis:           12,
  kommission:      14,
  zahlungsstatus:  15,
  zahlungsmethode: 16,
  bemerkungen:     17,
  zimmertyp:       21,
  adresse:         24,
}

// ── Helpers ───────────────────────────────────────────────────────────────

function str(val: unknown): string {
  return val == null ? '' : String(val).trim()
}

function num(val: unknown): number {
  if (typeof val === 'number') return val
  const n = parseFloat(str(val).replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function parsePrice(val: unknown): number | null {
  const s = str(val)
  if (!s) return null
  const m = s.match(/([\d]+\.?[\d]*)/)
  return m ? parseFloat(m[1]) : null
}

function mapCategory(roomType: string): DbCategory {
  const t = roomType.toLowerCase()
  if (t.includes('familienzimmer') || t.includes('verbindungstür') || t.includes('family room')) return 'family'
  if (t.includes('triple') || t.includes('dreibett') || t.includes('schlafsofa')) return 'double_sofa'
  if (t.includes('single') || t.includes('einzel')) return 'single'
  if (t.includes('double') || t.includes('doppel')) return 'double'
  return 'unknown'
}

// Parse "Double Room, Single Room" into per-room categories
function parseRoomCategories(zimmertyp: string, zimmerAnzahl: number): DbCategory[] {
  // Family room always creates 2 physical rooms even though Zimmer=1
  const baseCategory = mapCategory(zimmertyp)
  if (baseCategory === 'family') return ['double', 'double']

  // Mixed types: "Double Room, Single Room"
  if (zimmertyp.includes(',')) {
    const parts = zimmertyp.split(',').map(p => mapCategory(p.trim()))
    if (parts.length === zimmerAnzahl) return parts
    // If counts don't match, duplicate as needed
    const result: DbCategory[] = []
    for (const p of parts) {
      result.push(p)
      if (result.length === zimmerAnzahl) break
    }
    while (result.length < zimmerAnzahl) result.push(baseCategory)
    return result
  }

  // Same type repeated
  return Array(Math.max(1, zimmerAnzahl)).fill(baseCategory)
}

// Split "Andreas Dreßen; Christoph Windhaus" by semicolons
function splitNames(name: string, count: number): string[] {
  const parts = name.split(/\s*;\s*/).filter(Boolean)
  if (parts.length === count) return parts
  // Not enough names — repeat the first
  const result = [...parts]
  while (result.length < count) result.push(parts[0] || name)
  return result
}

function mapPayment(zahlungsstatus: string, zahlungsmethode: string): { paymentStatus: string; paymentMethod: string } {
  const s = zahlungsstatus.toLowerCase()
  const m = zahlungsmethode.toLowerCase()

  if (s.includes('booking.com')) return { paymentStatus: 'paid', paymentMethod: 'online' }
  if (m.includes('visa') || m.includes('mastercard') || m.includes('credit') || m.includes('kreditkarte')) {
    return { paymentStatus: 'unpaid', paymentMethod: 'credit_card' }
  }
  if (m.includes('ec') || m.includes('debit') || m.includes('girocard')) {
    return { paymentStatus: 'unpaid', paymentMethod: 'ec_card' }
  }
  if (m.includes('bar') || m.includes('cash')) {
    return { paymentStatus: 'unpaid', paymentMethod: 'cash' }
  }
  return { paymentStatus: 'unpaid', paymentMethod: 'unpaid' }
}

// ── Main export ───────────────────────────────────────────────────────────

export function parseExcelBuffer(buffer: Buffer): ExcelRow[] {
  const XLSX = require('xlsx')
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

  // Skip header row (row 0)
  const dataRows = raw.slice(1).filter(r => Array.isArray(r) && r[C.buchungsnummer])

  const result: ExcelRow[] = []

  for (const r of dataRows as unknown[][]) {
    const bookingNumber = str(r[C.buchungsnummer])
    const gastname      = str(r[C.gastname])
    const checkin       = str(r[C.anreise])
    const checkout      = str(r[C.abreise])
    const zimmerAnzahl  = Math.max(1, num(r[C.zimmerAnzahl]) || 1)
    const erwachsene    = num(r[C.erwachsene])
    const kinder        = num(r[C.kinder])
    const kinderAlter   = str(r[C.kinderAlter])
    const totalPrice    = parsePrice(r[C.preis])
    const commission    = parsePrice(r[C.kommission])
    const zahlstatus    = str(r[C.zahlungsstatus])
    const zahlmethode   = str(r[C.zahlungsmethode])
    const bemerkungen   = str(r[C.bemerkungen])
    const zimmertyp     = str(r[C.zimmertyp])
    const adresse       = str(r[C.adresse])

    const payment  = mapPayment(zahlstatus, zahlmethode)
    const cats     = parseRoomCategories(zimmertyp, zimmerAnzahl)
    const isFamily = mapCategory(zimmertyp) === 'family'
    const splitTotal = cats.length

    // Build notes — only Bemerkungen (guest notes from Booking.com)
    // Children ages are not included; staff can add manually if needed
    const notesText = bemerkungen

    // Split guest names (e.g. "Dreßen; Windhaus")
    const names = splitNames(gastname, splitTotal)

    // Split adults evenly
    const adultsPerRoom = Math.max(1, Math.floor(erwachsene / splitTotal))
    // Split price evenly (family: full price on main, 0 on connected room)
    const pricePerRoom = totalPrice != null ? Math.round((totalPrice / splitTotal) * 100) / 100 : null
    const commPerRoom  = commission  != null ? Math.round((commission  / splitTotal) * 100) / 100 : null

    for (let i = 0; i < splitTotal; i++) {
      result.push({
        bookingNumber,
        guestName:   names[i] || gastname,
        checkin,
        checkout,
        adults:      i === 0 ? erwachsene - adultsPerRoom * (splitTotal - 1) : adultsPerRoom,
        children:    i === 0 ? kinder : 0,
        childrenAges: i === 0 ? kinderAlter : '',
        totalPrice:  isFamily && i > 0 ? 0        : pricePerRoom,
        commission:  isFamily && i > 0 ? 0        : commPerRoom,
        paymentStatus: payment.paymentStatus,
        paymentMethod: payment.paymentMethod,
        notes:       notesText,
        adresse,
        roomTypeRaw: zimmertyp,
        zimmerAnzahl,
        dbCategory:  cats[i],
        isFamily,
        splitIndex:  i,
        splitTotal,
        splitRoomCategory: cats[i],
      })
    }
  }

  return result
}
