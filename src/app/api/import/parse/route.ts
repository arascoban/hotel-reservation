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
  assignmentNote: string   // explains auto-assignment decisions
  availableRooms: AvailableRoom[]
  suggestedRoomId: string | null
}

// Family room pairs in priority order (room_number strings)
// 21+22: single(21) + double(22) — preferred when room 22 is free (≤3 guests)
// 19+20: double+double — preferred for 4+ guests OR when room 22 is taken
// 11+12: double+double — fallback
const FAMILY_PAIRS: [string, string][] = [
  ['21', '22'],
  ['19', '20'],
  ['11', '12'],
]

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

    // Load all active rooms
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

    // Date range for conflict check
    const checkinDates  = parsed.filter(p => p.checkin).map(p => p.checkin)
    const checkoutDates = parsed.filter(p => p.checkout).map(p => p.checkout)
    const minDate = [...checkinDates].sort()[0]  ?? new Date().toISOString().slice(0, 10)
    const maxDate = [...checkoutDates].sort().reverse()[0] ?? new Date().toISOString().slice(0, 10)

    const { data: existingRes } = await supabase
      .from('reservations')
      .select('room_id, checkin_at, checkout_at')
      .not('status', 'in', '("cancelled","no_show")')
      .lte('checkin_at', `${maxDate}T23:59:59`)
      .gte('checkout_at', `${minDate}T00:00:00`)

    // Group entries by booking number (needed for family pair processing)
    const entriesByBooking = new Map<string, ExcelRow[]>()
    for (const e of parsed) {
      const arr = entriesByBooking.get(e.bookingNumber) ?? []
      arr.push(e)
      entriesByBooking.set(e.bookingNumber, arr)
    }

    // Cache duplicate checks per booking number (avoid redundant DB calls)
    const duplicateCache = new Map<string, boolean>()

    const usedInImport = new Set<string>()
    const importRows: ImportRow[] = []

    // ── Sort: non-family first so single/double bookings claim rooms
    //    (e.g. room 22) before family pairs are evaluated.
    const sortedEntries = [...parsed].sort((a, b) => {
      if (a.isFamily === b.isFamily) return 0
      return a.isFamily ? 1 : -1   // non-family first
    })

    for (const entry of sortedEntries) {
      // Family pair partners are pushed when we process splitIndex=0 — skip them here
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

      // Check duplicate (cached per booking number)
      if (!duplicateCache.has(entry.bookingNumber)) {
        const { data: ext } = await supabase
          .from('reservations').select('id').eq('external_id', entry.bookingNumber).limit(1)
        duplicateCache.set(entry.bookingNumber, (ext?.length ?? 0) > 0)
      }
      const alreadyImported = duplicateCache.get(entry.bookingNumber) ?? false

      const warnings: string[] = []
      if (!entry.checkin || !entry.checkout) warnings.push('Datum fehlt')
      if (!entry.dbCategory || entry.dbCategory === 'unknown') warnings.push('Zimmertyp unbekannt')

      // ── Family room pair ──────────────────────────────────────────────────
      if (entry.isFamily) {
        const group   = entriesByBooking.get(entry.bookingNumber) ?? []
        const partner = group.find(e => e.splitIndex === 1)

        // Total guests decides which pair to prefer.
        // ≤3 guests → try 21+22 first (single+double connecting doors).
        //   Since non-family entries were sorted first, room 22 is already claimed
        //   by any solo traveller who needed it — the 21+22 check naturally fails
        //   and we fall through to 19+20 or 11+12.
        // ≥4 guests → skip 21+22 (single too small), try 19+20 then 11+12.
        const totalGuests = group.reduce((s, e) => s + e.adults + e.children, 0)

        const orderedPairs: [string, string][] = totalGuests <= 3
          ? FAMILY_PAIRS                                        // 21+22, 19+20, 11+12
          : [...FAMILY_PAIRS.slice(1), FAMILY_PAIRS[0]]        // 19+20, 11+12, 21+22

        let suggested0: string | null = null
        let suggested1: string | null = null
        let assignmentNote = ''

        if (!alreadyImported) {
          for (const pair of orderedPairs) {
            const r0 = allRooms.find(r => r.room_number === pair[0])
            const r1 = allRooms.find(r => r.room_number === pair[1])
            if (!r0 || !r1) continue

            const r0free = !bookedForEntry.has(r0.id) && !usedInImport.has(r0.id)
            const r1free = !bookedForEntry.has(r1.id) && !usedInImport.has(r1.id)

            if (r0free && r1free) {
              suggested0 = r0.id
              suggested1 = r1.id
              usedInImport.add(r0.id)
              usedInImport.add(r1.id)

              // Build a human-readable explanation
              if (pair[0] === '21') {
                assignmentNote = `Zi. 21+22 zugewiesen (Einzelzimmer war frei, ${totalGuests} Gäste)`
              } else {
                // Why didn't we use 21+22?
                const room22 = allRooms.find(r => r.room_number === '22')
                const room22taken = room22 && (bookedForEntry.has(room22.id) || usedInImport.has(room22.id))
                const reason = totalGuests > 3
                  ? `${totalGuests} Gäste → Doppelzimmer-Paar bevorzugt`
                  : room22taken
                    ? 'Einzelzimmer (Zi. 22) bereits vergeben'
                    : 'Zi. 21+22 nicht verfügbar'
                assignmentNote = `Zi. ${pair[0]}+${pair[1]} zugewiesen — ${reason}`
              }
              break
            }
          }

          if (!suggested0) {
            assignmentNote = 'Kein freies Zimmer-Paar gefunden — bitte manuell zuweisen'
          }
        }

        const avail0 = filterAvailableRooms(allRooms, bookedForEntry, entry.dbCategory, new Set())
        const avail1 = partner
          ? filterAvailableRooms(allRooms, bookedForEntry, partner.dbCategory, new Set())
          : avail0

        importRows.push(buildRow(entry, randomUUID(), warnings, avail0, suggested0, alreadyImported, assignmentNote))

        if (partner) {
          importRows.push(buildRow(partner, randomUUID(), [], avail1, suggested1, alreadyImported, ''))
        }
        continue
      }

      // ── Normal single room ────────────────────────────────────────────────
      const availableRooms = filterAvailableRooms(allRooms, bookedForEntry, entry.dbCategory, new Set())
      const suggested = availableRooms.find(r => !usedInImport.has(r.id)) ?? availableRooms[0] ?? null
      if (suggested) usedInImport.add(suggested.id)

      importRows.push(buildRow(entry, randomUUID(), warnings, availableRooms, suggested?.id ?? null, alreadyImported, ''))
    }

    return NextResponse.json({ rows: importRows })
  } catch (err: any) {
    console.error('Excel parse error:', err)
    return NextResponse.json({ error: `Fehler beim Parsen: ${err?.message ?? 'Unbekannter Fehler'}` }, { status: 500 })
  }
}
