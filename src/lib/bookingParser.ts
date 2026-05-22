// ── Booking.com PDF Parser ──────────────────────────────────────────────────
// Handles both English (test) and German (production) booking.com exports.

export type DbCategory = 'single' | 'double' | 'double_sofa' | 'family' | 'unknown'
export type PaymentStatus = 'paid' | 'unpaid'
export type PaymentMethod = 'online' | 'unpaid' | 'credit_card'

export interface RawParsedEntry {
  bookingNumber: string
  guestName: string
  checkin: string        // YYYY-MM-DD or ''
  checkout: string       // YYYY-MM-DD or ''
  guestCount: number
  totalPrice: number | null
  commission: number | null
  roomTypeRaw: string
  dbCategory: DbCategory
  splitCount: number     // 1 normally, 2 for "2 x Double", etc.
  splitRooms: DbCategory[] // one entry per room needed
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod
  isFamily: boolean
  parseWarnings: string[]
  rawBlock: string
}

// ── Date parsing ──────────────────────────────────────────────────────────

const MONTHS_EN: Record<string, number> = {
  jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
  jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
}
const MONTHS_DE: Record<string, number> = {
  januar:1, februar:2, 'märz':3, april:4, mai:5, juni:6,
  juli:7, august:8, september:9, oktober:10, november:11, dezember:12,
}

function parseDate(text: string): string | null {
  // English: May 22, 2026 or May 22 2026
  const enMatch = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i)
  if (enMatch) {
    const m = MONTHS_EN[enMatch[1].toLowerCase().slice(0, 3)]
    return `${enMatch[3]}-${String(m).padStart(2, '0')}-${enMatch[2].padStart(2, '0')}`
  }
  // German long: 22. Mai 2026
  const deLong = text.match(/(\d{1,2})\.\s*(januar|februar|m[äa]rz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(\d{4})/i)
  if (deLong) {
    const m = MONTHS_DE[deLong[2].toLowerCase()] ?? MONTHS_DE['märz']
    return `${deLong[3]}-${String(m).padStart(2, '0')}-${deLong[1].padStart(2, '0')}`
  }
  // German short: 22.05.2026
  const deShort = text.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/)
  if (deShort) return `${deShort[3]}-${deShort[2]}-${deShort[1]}`

  return null
}

function extractAllDates(text: string): string[] {
  const found: string[] = []
  // Scan for all date-like patterns in order
  const combined = text.replace(/\n/g, ' ')

  // English dates
  const enRe = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/gi
  let m: RegExpExecArray | null
  const positions: Array<{pos: number, str: string}> = []
  while ((m = enRe.exec(combined)) !== null) positions.push({ pos: m.index, str: m[0] })

  // German long
  const deLongRe = /\d{1,2}\.\s*(januar|februar|m[äa]rz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+\d{4}/gi
  while ((m = deLongRe.exec(combined)) !== null) positions.push({ pos: m.index, str: m[0] })

  // German short (DD.MM.YYYY)
  const deShortRe = /\b(\d{2})\.(\d{2})\.(\d{4})\b/g
  while ((m = deShortRe.exec(combined)) !== null) positions.push({ pos: m.index, str: m[0] })

  positions.sort((a, b) => a.pos - b.pos)

  for (const { str } of positions) {
    const d = parseDate(str)
    if (d && !found.includes(d)) found.push(d)
  }
  return found
}

// ── Guest count ───────────────────────────────────────────────────────────

function extractGuestCount(text: string): number {
  let total = 0
  // "2 adults" / "2 Erwachsene"
  const adultMatch = text.match(/(\d+)\s*(adult|erwachsene?)/i)
  if (adultMatch) total += parseInt(adultMatch[1])
  // "1 child" / "1 Kind" / "2 children" / "2 Kinder"
  const childMatch = text.match(/(\d+)\s*(child|children|kind|kinder)/i)
  if (childMatch) total += parseInt(childMatch[1])
  return total || 1
}

// ── Room type parsing ─────────────────────────────────────────────────────

function mapSingleType(text: string): DbCategory {
  const t = text.toLowerCase()
  if (t.includes('familien') || t.includes('family') || t.includes('verbindung')) return 'family'
  if (t.includes('einzel') || t.includes('single')) return 'single'
  if (t.includes('dreibett') || t.includes('triple') || t.includes('schlafsofa') || t.includes('sofa')) return 'double_sofa'
  if (t.includes('doppel') || t.includes('double')) return 'double'
  return 'unknown'
}

interface RoomTypeResult {
  raw: string
  rooms: DbCategory[]   // one per physical room needed
  isFamily: boolean
}

function parseRoomType(text: string): RoomTypeResult {
  const lower = text.toLowerCase().trim()

  // Family room always becomes 2 physical rooms
  if (lower.includes('verbindung') || lower.includes('familien') || lower.includes('family')) {
    return { raw: text.trim(), rooms: ['double', 'double'], isFamily: true }
  }

  // "2 x Doppelzimmer" / "2 x Double Room"
  const multiMatch = lower.match(/(\d+)\s*x\s*([^,\n]+)/g)
  if (multiMatch && multiMatch.length > 0) {
    const rooms: DbCategory[] = []
    for (const part of multiMatch) {
      const m2 = part.match(/(\d+)\s*x\s*(.+)/)
      if (m2) {
        const count = parseInt(m2[1])
        const cat = mapSingleType(m2[2])
        for (let i = 0; i < count; i++) rooms.push(cat)
      }
    }
    if (rooms.length > 0) return { raw: text.trim(), rooms, isFamily: false }
  }

  // Single room entry
  const cat = mapSingleType(lower)
  return { raw: text.trim(), rooms: [cat], isFamily: false }
}

// ── Room type keyword extraction from block ───────────────────────────────

const ROOM_KEYWORDS = [
  // German
  'familienzimmer mit verbindungstür', 'familienzimmer', 'doppelzimmer mit schlafsofa',
  'dreibettzimmer', 'doppelzimmer', 'einzelzimmer',
  // English
  'family room', 'double room with sofa', 'triple room', 'double room', 'single room',
  // Short with multiplier patterns
]

function extractRoomTypeFromBlock(block: string): string {
  const lower = block.toLowerCase()

  // Check for multiplier patterns first: "2 x Doppelzimmer", "1 x Einzelzimmer, 1 x Doppelzimmer"
  const multiRe = /(\d+\s*x\s*[\wäöüÄÖÜ\s]+?)(?=,|\d+\s*x|€|\d{10}|ok\b|$)/gi
  const multiMatches: string[] = []
  let mm: RegExpExecArray | null
  while ((mm = multiRe.exec(lower)) !== null) {
    const candidate = mm[1].trim()
    if (candidate.match(/\d+\s*x/)) multiMatches.push(candidate)
  }
  if (multiMatches.length > 0) return multiMatches.join(', ')

  // Check for known keywords
  for (const kw of ROOM_KEYWORDS) {
    if (lower.includes(kw)) return kw
  }
  return ''
}

// ── Payment status ────────────────────────────────────────────────────────

function extractPaymentStatus(block: string): { paymentStatus: PaymentStatus; paymentMethod: PaymentMethod } {
  const lower = block.toLowerCase()
  if (lower.includes('booking.com') || lower.includes('zahlung über')) {
    return { paymentStatus: 'paid', paymentMethod: 'online' }
  }
  if (lower.includes('card verified') || lower.includes('karte') || lower.includes('kreditkarte')) {
    return { paymentStatus: 'unpaid', paymentMethod: 'credit_card' }
  }
  return { paymentStatus: 'unpaid', paymentMethod: 'unpaid' }
}

// ── Guest name extraction ─────────────────────────────────────────────────

function extractGuestName(block: string, firstDate: string | undefined): string {
  // Take content before the first date
  let candidate = block
  if (firstDate) {
    // Find first date-like pattern and take text before it
    const datePatterns = [
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d/i,
      /\d{1,2}\.\s*(januar|februar|m[äa]rz|april|mai|juni|juli|august|september|oktober|november|dezember)/i,
      /\b\d{2}\.\d{2}\.\d{4}\b/,
    ]
    for (const re of datePatterns) {
      const idx = block.search(re)
      if (idx > 0) { candidate = block.slice(0, idx); break }
    }
  }

  // Remove known noise
  const cleaned = candidate
    .replace(/\d+\s*(adult|erwachsen|child|kinder|kind)/gi, '')
    .replace(/guest name|gastname|check[- ]in|check[- ]out/gi, '')
    .replace(/\d+/g, '')
    .replace(/[€,\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || 'Unbekannt'
}

// ── Main parser ───────────────────────────────────────────────────────────

export function parseBookingText(rawText: string): RawParsedEntry[] {
  // Find all 10-digit booking numbers as anchors
  const bnRe = /\b(\d{10})\b/g
  const anchors: Array<{ number: string; end: number }> = []
  let m: RegExpExecArray | null
  while ((m = bnRe.exec(rawText)) !== null) {
    anchors.push({ number: m[1], end: m.index + m[0].length })
  }

  if (anchors.length === 0) return []

  const results: RawParsedEntry[] = []

  for (let i = 0; i < anchors.length; i++) {
    const { number, end } = anchors[i]
    const start = i === 0 ? 0 : anchors[i - 1].end
    const block = rawText.slice(start, end).trim()
    const warnings: string[] = []

    // ── Prices ──
    const prices: number[] = []
    const priceRe = /€\s*([\d]+[,.]?[\d]*)/g
    let pm: RegExpExecArray | null
    while ((pm = priceRe.exec(block)) !== null) {
      prices.push(parseFloat(pm[1].replace(',', '.')))
    }
    if (prices.length === 0) warnings.push('Kein Preis gefunden')

    // ── Dates ──
    const dates = extractAllDates(block)
    if (dates.length < 2) warnings.push('Weniger als 2 Daten gefunden')

    // ── Guest count ──
    const guestCount = extractGuestCount(block)

    // ── Room type ──
    const roomTypeRaw = extractRoomTypeFromBlock(block)
    const rtResult = parseRoomType(roomTypeRaw || block)
    if (!roomTypeRaw) warnings.push('Zimmertyp nicht erkannt')

    // ── Payment ──
    const payment = extractPaymentStatus(block)

    // ── Name ──
    const guestName = extractGuestName(block, dates[0])

    // ── Build entries (one per room needed) ──
    const roomsNeeded = rtResult.rooms.length === 0 ? ['unknown' as DbCategory] : rtResult.rooms
    const pricePerRoom = prices[0] != null ? Math.round((prices[0] / roomsNeeded.length) * 100) / 100 : null
    const commissionPerRoom = prices[1] != null ? Math.round((prices[1] / roomsNeeded.length) * 100) / 100 : null
    const guestPerRoom = Math.max(1, Math.floor(guestCount / roomsNeeded.length))

    roomsNeeded.forEach((cat, idx) => {
      results.push({
        bookingNumber: number,
        guestName,
        checkin: dates[0] ?? '',
        checkout: dates[1] ?? '',
        guestCount: idx === 0 ? guestCount - guestPerRoom * (roomsNeeded.length - 1) : guestPerRoom,
        totalPrice: pricePerRoom,
        commission: commissionPerRoom,
        roomTypeRaw: rtResult.raw,
        dbCategory: cat,
        splitCount: roomsNeeded.length,
        splitRooms: roomsNeeded,
        isFamily: rtResult.isFamily,
        ...payment,
        parseWarnings: idx === 0 ? warnings : [],
        rawBlock: block,
      })
    })
  }

  return results
}
