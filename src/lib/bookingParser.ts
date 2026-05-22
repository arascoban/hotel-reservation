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
  splitCount: number
  splitRooms: DbCategory[]
  paymentStatus: PaymentStatus
  paymentMethod: PaymentMethod
  isFamily: boolean
  parseWarnings: string[]
  rawBlock: string
}

// ── Text cleanup ──────────────────────────────────────────────────────────

function cleanRawText(text: string): string {
  return text
    // Strip PDF table header / navigation that pollutes the first block
    .replace(/hotel pension[^]*?(?:check-?in|gastname)\s*/gi, '')
    .replace(/date\s+of\s+(?:check-?in\s+)?from[^\n]*/gi, '')
    .replace(/until\s+[a-z]+\s+\d+,?\s+\d{4}/gi, '')
    .replace(/download\s+\d+.*?list/gi, '')
    .replace(/reservierungsliste[^\n]*/gi, '')
    .replace(/guest name.*?booking.*?number\s*/gis, '')
    .replace(/gastname.*?buchungsnummer\s*/gis, '')
    .replace(/check-?in\s+check-?out\s+/gi, '')
    // Strip page footers
    .replace(/back\s*next\s*show\s*\d+[^\n]*/gi, '')
    .replace(/advice\s*new\s*\d+/gi, '')
    .replace(/https?:\/\/admin\.booking\.com[^\n]*/gi, '')
    .replace(/\d+\s*von\s*\d+[^\n]*/gi, '')        // "2 von 2 22.05.2026"
    .replace(/page\s+\d+[^\n]*/gi, '')
    .replace(/commission and charges[^\n]*/gi, '')
    .replace(/gesamtpreis[^\n]*/gi, '')
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
  // Normalize whitespace so "May\n22,\n2026" → "May 22, 2026"
  const t = text.replace(/\s+/g, ' ')

  // English: May 22, 2026
  const enMatch = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i)
  if (enMatch) {
    const m = MONTHS_EN[enMatch[1].toLowerCase().slice(0, 3)]
    return `${enMatch[3]}-${String(m).padStart(2, '0')}-${enMatch[2].padStart(2, '0')}`
  }
  // German long: 22. Mai 2026
  const deLong = t.match(/(\d{1,2})\.\s*(januar|februar|m[äa]rz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(\d{4})/i)
  if (deLong) {
    const m = MONTHS_DE[deLong[2].toLowerCase()] ?? 1
    return `${deLong[3]}-${String(m).padStart(2, '0')}-${deLong[1].padStart(2, '0')}`
  }
  // German short: 22.05.2026
  const deShort = t.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/)
  if (deShort) return `${deShort[3]}-${deShort[2]}-${deShort[1]}`

  return null
}

function extractAllDates(text: string): string[] {
  // Normalize ALL whitespace so split dates ("May\n22,\n2026") become "May 22, 2026"
  const flat = text.replace(/\s+/g, ' ')
  const found: string[] = []

  const patterns = [
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b/gi,
    /\d{1,2}\.\s*(januar|februar|m[äa]rz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+\d{4}/gi,
    /\b\d{2}\.\d{2}\.\d{4}\b/g,
  ]
  const positions: Array<{ pos: number; str: string }> = []
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(flat)) !== null) positions.push({ pos: m.index, str: m[0] })
  }
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
  const flat = text.replace(/\s+/g, ' ')
  const adultMatch = flat.match(/(\d+)\s*(adult|erwachsen)/i)
  if (adultMatch) total += parseInt(adultMatch[1])
  const childMatch = flat.match(/(\d+)\s*(child|children|kind|kinder)/i)
  if (childMatch) total += parseInt(childMatch[1])
  return total || 1
}

// ── Room type parsing ─────────────────────────────────────────────────────

function mapSingleType(text: string): DbCategory {
  // Normalize whitespace (handles "Triple\nRoom" → "Triple Room")
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim()
  if (t.includes('familien') || t.includes('family') || t.includes('verbindun')) return 'family'
  if (t.includes('einzel') || t.includes('single')) return 'single'
  if (t.includes('dreibett') || t.includes('triple') || t.includes('schlafsofa') || t.includes('sofa')) return 'double_sofa'
  if (t.includes('doppel') || t.includes('double')) return 'double'
  return 'unknown'
}

interface RoomTypeResult {
  raw: string
  rooms: DbCategory[]
  isFamily: boolean
}

function parseRoomType(text: string): RoomTypeResult {
  const lower = text.toLowerCase().replace(/\s+/g, ' ').trim()

  // Family room always needs 2 physical rooms
  if (lower.includes('verbindun') || lower.includes('familien') || lower.includes('family')) {
    return { raw: text.trim(), rooms: ['double', 'double'], isFamily: true }
  }

  // "2 x Doppelzimmer" / "2 x Double Room" / "1 x Single, 1 x Double"
  const multiRe = /(\d+)\s*x\s*([^,]+)/g
  const rooms: DbCategory[] = []
  let m: RegExpExecArray | null
  while ((m = multiRe.exec(lower)) !== null) {
    const count = parseInt(m[1])
    const cat = mapSingleType(m[2])
    for (let i = 0; i < count; i++) rooms.push(cat)
  }
  if (rooms.length > 0) return { raw: text.trim(), rooms, isFamily: false }

  const cat = mapSingleType(lower)
  return { raw: text.trim(), rooms: [cat], isFamily: false }
}

function extractRoomTypeFromBlock(block: string): string {
  // Normalize whitespace so "Triple\nRoom" → "Triple Room"
  const flat  = block.replace(/\s+/g, ' ')
  const lower = flat.toLowerCase()

  // Multiplier patterns: "2 x Doppelzimmer", "1 x Single Room, 1 x Double Room"
  const multiRe = /(\d+\s*x\s+[\wäöüÄÖÜ\s]+?)(?=,\s*\d|€|\d{10}|\bok\b|$)/gi
  const parts: string[] = []
  let mm: RegExpExecArray | null
  while ((mm = multiRe.exec(flat)) !== null) {
    const candidate = mm[1].trim()
    if (/\d+\s*x/i.test(candidate)) parts.push(candidate)
  }
  if (parts.length > 0) return parts.join(', ')

  // Known keywords (order: longest first)
  const KEYWORDS = [
    'familienzimmer mit verbindungstür', 'familienzimmer', 'doppelzimmer mit schlafsofa',
    'dreibettzimmer', 'doppelzimmer', 'einzelzimmer',
    'family room with connecting', 'family room', 'triple room', 'double room with sofa',
    'double room', 'single room', 'triple', 'double', 'single',
    // partial matches for split text
    'familienzi', 'verbindun',
  ]
  for (const kw of KEYWORDS) {
    if (lower.includes(kw)) return kw
  }
  return ''
}

// ── Payment status ────────────────────────────────────────────────────────

function extractPaymentStatus(block: string): { paymentStatus: PaymentStatus; paymentMethod: PaymentMethod } {
  const lower = block.toLowerCase().replace(/\s+/g, ' ')
  if (lower.includes('booking.com') || lower.includes('zahlung über')) {
    return { paymentStatus: 'paid', paymentMethod: 'online' }
  }
  if (lower.includes('card verified') || lower.includes('karte verifiziert')) {
    return { paymentStatus: 'unpaid', paymentMethod: 'credit_card' }
  }
  return { paymentStatus: 'unpaid', paymentMethod: 'unpaid' }
}

// ── Guest name ────────────────────────────────────────────────────────────

function extractGuestName(block: string): string {
  const flat = block.replace(/\s+/g, ' ')

  // Find the position of first date or guest count
  const anchors = [
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}/i,
    /\d{1,2}\.\s*(januar|februar|m[äa]rz|april|mai|juni|juli|august|september|oktober|november|dezember)/i,
    /\b\d{2}\.\d{2}\.\d{4}\b/,
    /\d+\s*(adult|erwachsen|child|kind)/i,
  ]
  let cutIdx = flat.length
  for (const re of anchors) {
    const idx = flat.search(re)
    if (idx > 0 && idx < cutIdx) cutIdx = idx
  }

  const candidate = flat.slice(0, cutIdx)
  const cleaned = candidate
    .replace(/\d+/g, '')
    .replace(/[€,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned || 'Unbekannt'
}

// ── Main parser ───────────────────────────────────────────────────────────

export function parseBookingText(rawText: string): RawParsedEntry[] {
  // Strip PDF boilerplate first
  const text = cleanRawText(rawText)

  // Find all 10-digit booking numbers — use (?<!\d)…(?!\d) instead of \b
  // because numbers sometimes touch letters ("6966189744BackNext")
  const bnRe = /(?<!\d)(\d{10})(?!\d)/g
  const anchors: Array<{ number: string; end: number }> = []
  let m: RegExpExecArray | null
  while ((m = bnRe.exec(text)) !== null) {
    anchors.push({ number: m[1], end: m.index + m[0].length })
  }

  if (anchors.length === 0) return []

  const results: RawParsedEntry[] = []

  for (let i = 0; i < anchors.length; i++) {
    const { number, end } = anchors[i]
    const start = i === 0 ? 0 : anchors[i - 1].end
    const block = text.slice(start, end).trim()
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
    if (!roomTypeRaw) warnings.push('Zimmertyp nicht erkannt — bitte manuell wählen')

    // ── Payment ──
    const payment = extractPaymentStatus(block)

    // ── Name ──
    const guestName = extractGuestName(block)

    // ── Build one ImportRow per physical room needed ──
    const roomsNeeded = rtResult.rooms.length > 0 ? rtResult.rooms : ['unknown' as DbCategory]
    const n = roomsNeeded.length
    const pricePerRoom  = prices[0]  != null ? Math.round((prices[0]  / n) * 100) / 100 : null
    const commPerRoom   = prices[1]  != null ? Math.round((prices[1]  / n) * 100) / 100 : null
    const guestsPerRoom = Math.max(1, Math.floor(guestCount / n))

    roomsNeeded.forEach((cat, idx) => {
      results.push({
        bookingNumber: number,
        guestName,
        checkin:  dates[0] ?? '',
        checkout: dates[1] ?? '',
        guestCount: idx === 0 ? guestCount - guestsPerRoom * (n - 1) : guestsPerRoom,
        totalPrice:  rtResult.isFamily && idx > 0 ? 0 : pricePerRoom,
        commission:  rtResult.isFamily && idx > 0 ? 0 : commPerRoom,
        roomTypeRaw: rtResult.raw,
        dbCategory:  cat,
        splitCount:  n,
        splitRooms:  roomsNeeded,
        isFamily:    rtResult.isFamily,
        ...payment,
        parseWarnings: idx === 0 ? warnings : [],
        rawBlock: block,
      })
    })
  }

  return results
}
