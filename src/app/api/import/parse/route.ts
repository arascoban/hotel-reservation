import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseExcelBuffer, type ExcelRow, type DbCategory } from '@/lib/excelParser'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

interface AvailableRoom {
  id: string
  room_number: string
  name: string
  category: DbCategory
}

export interface FamilyPairOption {
  numbers: [string, string]
  label: string
  room0Id: string | null
  room1Id: string | null
  maxPersons: number
  available: boolean   // both rooms free for this date range
}

interface ImportRow {
  tempId: string
  bookingNumber: string
  guestName: string
  checkin: string
  checkout: string
  adults: number
  children: number
  guestCount: number
  totalPrice: number | null
  commission: number | null
  paymentStatus: string
  paymentMethod: string
  roomTypeRaw: string
  dbCategory: DbCategory
  isFamily: boolean
  splitCount: number
  notes: string
  adresse: string
  parseWarnings: string[]
  assignmentNote: string
  availableRooms: AvailableRoom[]
  suggestedRoomId: string | null
  // Family-only: single-card pair selector data
  familyPairs?: FamilyPairOption[]
  selectedRoom0Id?: string | null
  selectedRoom1Id?: string | null
}

// All three connecting room pairs
const FAMILY_PAIRS: [string, string][] = [
  ['21', '22'],
  ['19', '20'],
  ['11', '12'],
]

// Human-readable definitions for the pair selector
const PAIR_DEFS: { numbers: [string, string]; maxPersons: number; label: string }[] = [
  { numbers: ['11', '12'], maxPersons: 4, label: 'Familienzimmer 11+12 (Verbindungstür)' },
  { numbers: ['19', '20'], maxPersons: 4, label: 'Familienzimmer 19+20 (Verbindungstür)' },
  { numbers: ['21', '22'], maxPersons: 4, label: 'Familienzimmer 21+22 (Verbindungstür)' },
]

// Room numbers that belong to a connecting family pair. Individually they are
// sold as regular rooms (11/12/19/20/21 = double, 22 = single), but each one is
// also one half of a family unit. So for a normal single/double booking they
// must be the LAST resort — we keep them free for family bookings as long as a
// standalone room of the right category is available.
const FAMILY_ROOM_NUMBERS = new Set<string>(FAMILY_PAIRS.flat())

// Returns the connecting-room partner for a family-pair room, or null.
function familyPartnerOf(roomNumber: string): string | null {
  for (const [a, b] of FAMILY_PAIRS) {
    if (a === roomNumber) return b
    if (b === roomNumber) return a
  }
  return null
}

function filterAvailableRooms(
  allRooms: AvailableRoom[],
  bookedRoomIds: Set<string>,
  category: DbCategory,
  excludeIds: Set<string>,
): AvailableRoom[] {
  return allRooms.filter(r =>
    r.category === category &&
    !bookedRoomIds.has(r.id) &&
    !excludeIds.has(r.id),
  )
}

function buildRow(
  entry: ExcelRow,
  tempId: string,
  warnings: string[],
  availableRooms: AvailableRoom[],
  suggestedRoomId: string | null,
  alreadyImported: boolean,
  assignmentNote: string = '',
): ImportRow {
  return {
    tempId,
    bookingNumber:  entry.bookingNumber,
    guestName:      entry.guestName,
    checkin:        entry.checkin,
    checkout:       entry.checkout,
    adults:         entry.adults,
    children:       entry.children,
    guestCount:     entry.adults + entry.children,
    totalPrice:     entry.totalPrice,
    commission:     entry.commission,
    paymentStatus:  entry.paymentStatus,
    paymentMethod:  entry.paymentMethod,
    roomTypeRaw:    entry.roomTypeRaw,
    dbCategory:     entry.dbCategory,
    isFamily:       entry.isFamily,
    splitCount:     entry.splitTotal,
    notes:          entry.notes,
    adresse:        entry.adresse,
    parseWarnings:  warnings,
    assignmentNote,
    availableRooms,
    suggestedRoomId: alreadyImported ? '__DUPLICATE__' : suggestedRoomId,
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Keine Datei hochgeladen.' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['xls', 'xlsx'].includes(ext)) {
      return NextResponse.json({ error: 'Bitte eine Excel-Datei (.xls oder .xlsx) hochladen.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const parsed: ExcelRow[] = parseExcelBuffer(buffer)

    if (parsed.length === 0) {
      return NextResponse.json({ error: 'Keine Reservierungen gefunden. Bitte prüfe das Excel-Format.' }, { status: 422 })
    }

    const supabase = await createClient()
    const { data: roomsRaw } = await supabase
      .from('rooms')
      .select('id, room_number, name, room_type_id, room_types(category)')
      .eq('is_active', true)
      .order('sort_order')

    const allRooms: AvailableRoom[] = (roomsRaw ?? []).map((r: any) => ({
      id: r.id,
      room_number: r.room_number,
      name: r.name,
      category: r.room_types?.category as DbCategory ?? 'unknown',
    }))

    const checkinDates  = parsed.filter(p => p.checkin).map(p => p.checkin)
    const checkoutDates = parsed.filter(p => p.checkout).map(p => p.checkout)
    const minDate = [...checkinDates].sort()[0]  ?? new Date().toISOString().slice(0, 10)
    const maxDate = [...checkoutDates].sort().reverse()[0] ?? new Date().toISOString().slice(0, 10)

    const { data: existingRes } = await supabase
      .from('reservations')
      .select('room_id, checkin_at, checkout_at')
      .not('status', 'in', '("cancelled","no_show")')
      .is('deleted_at', null)
      .lte('checkin_at', `${maxDate}T23:59:59`)
      .gte('checkout_at', `${minDate}T00:00:00`)

    const entriesByBooking = new Map<string, ExcelRow[]>()
    for (const e of parsed) {
      const arr = entriesByBooking.get(e.bookingNumber) ?? []
      arr.push(e)
      entriesByBooking.set(e.bookingNumber, arr)
    }

    const duplicateCache = new Map<string, boolean>()
    const usedInImport   = new Set<string>()
    const importRows: ImportRow[] = []

    // Sort: singles(0) → family(1) → doubles(2) → double_sofa(3)
    function entrySortOrder(e: ExcelRow): number {
      if (e.isFamily)              return 1
      switch (e.dbCategory) {
        case 'single':      return 0
        case 'double':      return 2
        case 'double_sofa': return 3
        default:            return 4
      }
    }
    const sortedEntries = [...parsed].sort((a, b) => entrySortOrder(a) - entrySortOrder(b))

    for (const entry of sortedEntries) {
      if (entry.isFamily && entry.splitIndex > 0) continue

      const checkinTs  = entry.checkin  ? `${entry.checkin}T13:00:00`  : ''
      const checkoutTs = entry.checkout ? `${entry.checkout}T11:00:00` : ''

      const bookedForEntry = new Set<string>(
        (existingRes ?? [])
          .filter(r => {
            if (!checkinTs || !checkoutTs) return false
            return r.checkin_at < checkoutTs && r.checkout_at > checkinTs
          })
          .map((r: any) => r.room_id),
      )

      // Duplicate check — exclude soft-deleted so re-import after deletion works
      if (!duplicateCache.has(entry.bookingNumber)) {
        const { data: ext } = await supabase
          .from('reservations')
          .select('id')
          .eq('external_id', entry.bookingNumber)
          .is('deleted_at', null)
          .not('status', 'in', '("cancelled","no_show")')
          .limit(1)
        duplicateCache.set(entry.bookingNumber, (ext?.length ?? 0) > 0)
      }
      const alreadyImported = duplicateCache.get(entry.bookingNumber) ?? false

      const warnings: string[] = []
      if (!entry.checkin || !entry.checkout) warnings.push('Datum fehlt')
      if (!entry.dbCategory || entry.dbCategory === 'unknown') warnings.push('Zimmertyp unbekannt')

      // ── Family room: ONE combined card ────────────────────────────
      if (entry.isFamily) {
        const group       = entriesByBooking.get(entry.bookingNumber) ?? []
        const totalGuests = group.reduce((s, e) => s + e.adults + e.children, 0)
        const totalAdults = group.reduce((s, e) => s + e.adults, 0)
        const totalKids   = group.reduce((s, e) => s + e.children, 0)
        // Original price = pricePerRoom * splitTotal (parser halved it)
        const fullPrice   = entry.totalPrice != null ? entry.totalPrice * (entry.splitTotal || 2) : null
        const fullComm    = entry.commission  != null ? entry.commission  * (entry.splitTotal || 2) : null

        // Build all pair options with live availability
        const familyPairs: FamilyPairOption[] = PAIR_DEFS.map(def => {
          const r0 = allRooms.find(r => r.room_number === def.numbers[0])
          const r1 = allRooms.find(r => r.room_number === def.numbers[1])
          const available = !!r0 && !!r1 &&
            !bookedForEntry.has(r0.id) && !bookedForEntry.has(r1.id) &&
            !usedInImport.has(r0.id)   && !usedInImport.has(r1.id)
          return {
            numbers:    def.numbers,
            label:      def.label,
            room0Id:    r0?.id ?? null,
            room1Id:    r1?.id ?? null,
            maxPersons: def.maxPersons,
            available,
          }
        })

        // Auto-select priority pair (same logic as before)
        const orderedPairs: [string, string][] = totalGuests <= 3
          ? FAMILY_PAIRS
          : [...FAMILY_PAIRS.slice(1), FAMILY_PAIRS[0]]

        let selectedRoom0Id: string | null = null
        let selectedRoom1Id: string | null = null
        let assignmentNote = ''

        if (!alreadyImported) {
          for (const pair of orderedPairs) {
            const r0 = allRooms.find(r => r.room_number === pair[0])
            const r1 = allRooms.find(r => r.room_number === pair[1])
            if (!r0 || !r1) continue
            if (
              !bookedForEntry.has(r0.id) && !bookedForEntry.has(r1.id) &&
              !usedInImport.has(r0.id)   && !usedInImport.has(r1.id)
            ) {
              selectedRoom0Id = r0.id
              selectedRoom1Id = r1.id
              usedInImport.add(r0.id)
              usedInImport.add(r1.id)
              if (pair[0] === '21') {
                assignmentNote = `Zi. 21+22 zugewiesen — Einzelzimmer (Zi. 21) war frei (${totalGuests} Gäste)`
              } else {
                const room21 = allRooms.find(r => r.room_number === '21')
                const room21taken = room21 && (bookedForEntry.has(room21.id) || usedInImport.has(room21.id))
                const reason = totalGuests > 3
                  ? `${totalGuests} Gäste → Doppelzimmer-Paar bevorzugt`
                  : room21taken
                    ? 'Einzelzimmer (Zi. 21) bereits von Einzelgast belegt'
                    : 'Zi. 21+22 nicht verfügbar'
                assignmentNote = `Zi. ${pair[0]}+${pair[1]} zugewiesen — ${reason}`
              }
              break
            }
          }
          if (!selectedRoom0Id) {
            const reasons: string[] = []
            for (const pair of orderedPairs) {
              const r0 = allRooms.find(r => r.room_number === pair[0])
              const r1 = allRooms.find(r => r.room_number === pair[1])
              if (!r0 || !r1) { reasons.push(`Zi. ${pair[0]}+${pair[1]}: nicht konfiguriert`); continue }
              const r0why = bookedForEntry.has(r0.id) ? 'DB-Konflikt' : usedInImport.has(r0.id) ? 'schon vergeben' : 'frei'
              const r1why = bookedForEntry.has(r1.id) ? 'DB-Konflikt' : usedInImport.has(r1.id) ? 'schon vergeben' : 'frei'
              reasons.push(`Zi. ${pair[0]}(${r0why})+${pair[1]}(${r1why})`)
            }
            assignmentNote = `Kein Paar frei — ${reasons.join(', ')}`
          }
        }

        importRows.push({
          tempId:         randomUUID(),
          bookingNumber:  entry.bookingNumber,
          guestName:      entry.guestName,
          checkin:        entry.checkin,
          checkout:       entry.checkout,
          adults:         totalAdults,
          children:       totalKids,
          guestCount:     totalGuests,
          totalPrice:     fullPrice,
          commission:     fullComm,
          paymentStatus:  entry.paymentStatus,
          paymentMethod:  entry.paymentMethod,
          roomTypeRaw:    entry.roomTypeRaw,
          dbCategory:     'family' as DbCategory,
          isFamily:       true,
          splitCount:     2,
          notes:          entry.notes,
          adresse:        entry.adresse,
          parseWarnings:  warnings,
          assignmentNote,
          availableRooms: allRooms.filter(r => !bookedForEntry.has(r.id)),
          suggestedRoomId: alreadyImported ? '__DUPLICATE__' : selectedRoom0Id,
          familyPairs,
          selectedRoom0Id: alreadyImported ? null : selectedRoom0Id,
          selectedRoom1Id: alreadyImported ? null : selectedRoom1Id,
        })
        continue
      }

      // ── Normal single / double / double_sofa room ─────────────────
      // Assign standalone rooms first and only fall back to a family-pair
      // room when no standalone room of this category is free. Among
      // family-pair rooms, prefer ones whose connecting partner is already
      // taken (pair already broken) so we don't sacrifice an intact family
      // unit. This keeps 11+12 / 19+20 / 21+22 available for family bookings.
      const availableRooms = filterAvailableRooms(allRooms, bookedForEntry, entry.dbCategory, new Set())

      const fallbackRank = (r: AvailableRoom): number => {
        if (!FAMILY_ROOM_NUMBERS.has(r.room_number)) return 0   // standalone — first choice
        const partner = allRooms.find(x => x.room_number === familyPartnerOf(r.room_number))
        const partnerFree = !!partner && !bookedForEntry.has(partner.id) && !usedInImport.has(partner.id)
        return partnerFree ? 2 : 1   // intact pair last, already-broken pair in between
      }

      const suggested =
        availableRooms
          .filter(r => !usedInImport.has(r.id))
          .sort((a, b) => fallbackRank(a) - fallbackRank(b))[0]   // stable: keeps sort_order within a rank
        ?? availableRooms[0]
        ?? null
      if (suggested) usedInImport.add(suggested.id)

      // Flag the unusual case so staff notice a family-room half was used.
      const fallbackNote = suggested && FAMILY_ROOM_NUMBERS.has(suggested.room_number)
        ? `Zi. ${suggested.room_number} zugewiesen — kein Standardzimmer frei, Familienzimmer-Hälfte belegt`
        : ''

      importRows.push(buildRow(entry, randomUUID(), warnings, availableRooms, suggested?.id ?? null, alreadyImported, fallbackNote))
    }

    return NextResponse.json({ rows: importRows })
  } catch (err: any) {
    console.error('Excel parse error:', err)
    return NextResponse.json({ error: `Fehler beim Parsen: ${err?.message ?? 'Unbekannter Fehler'}` }, { status: 500 })
  }
}
