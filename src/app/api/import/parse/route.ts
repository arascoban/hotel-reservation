import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseBookingText, type RawParsedEntry, type DbCategory } from '@/lib/bookingParser'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

interface AvailableRoom {
  id: string
  room_number: string
  name: string
  category: DbCategory
}

interface ImportRow extends RawParsedEntry {
  tempId: string
  availableRooms: AvailableRoom[]
  suggestedRoomId: string | null
}

// Returns rooms of a given category that are free for [checkin, checkout)
function filterAvailableRooms(
  allRooms: AvailableRoom[],
  bookedRoomIds: Set<string>,   // already booked room IDs in the date range
  category: DbCategory,
  usedInImport: Set<string>,    // rooms already assigned in this import batch
): AvailableRoom[] {
  return allRooms.filter(r =>
    r.category === category &&
    !bookedRoomIds.has(r.id) &&
    !usedInImport.has(r.id),
  )
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('pdf') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    // Parse PDF text
    const buffer = Buffer.from(await file.arrayBuffer())
    // Dynamic import to avoid issues with bundling
    const pdfParse = (await import('pdf-parse')).default
    const pdfData = await pdfParse(buffer, { max: 0 })
    const rawText = pdfData.text

    // Extract reservations from text
    const parsed: RawParsedEntry[] = parseBookingText(rawText)
    if (parsed.length === 0) {
      return NextResponse.json({ error: 'Keine Reservierungen gefunden. Bitte prüfe das PDF-Format.' }, { status: 422 })
    }

    // Load all active rooms with their type category
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

    // Load all existing reservations to check conflicts
    const checkinDates = parsed.filter(p => p.checkin).map(p => p.checkin)
    const checkoutDates = parsed.filter(p => p.checkout).map(p => p.checkout)
    const minDate = [...checkinDates].sort()[0] ?? new Date().toISOString().slice(0, 10)
    const maxDate = [...checkoutDates].sort().reverse()[0] ?? new Date().toISOString().slice(0, 10)

    const { data: existingRes } = await supabase
      .from('reservations')
      .select('room_id, checkin_at, checkout_at')
      .not('status', 'in', '("cancelled","no_show")')
      .lte('checkin_at', `${maxDate}T23:59:59`)
      .gte('checkout_at', `${minDate}T00:00:00`)

    // Build per-entry import rows with availability
    const usedInImport = new Set<string>()
    const importRows: ImportRow[] = []

    for (const entry of parsed) {
      const tempId = crypto.randomUUID()

      // Find booked rooms for this specific date range
      const checkinTs = entry.checkin ? `${entry.checkin}T13:00:00` : ''
      const checkoutTs = entry.checkout ? `${entry.checkout}T11:00:00` : ''

      const bookedForThisEntry = new Set<string>(
        (existingRes ?? [])
          .filter(r => {
            if (!checkinTs || !checkoutTs) return false
            return r.checkin_at < checkoutTs && r.checkout_at > checkinTs
          })
          .map(r => r.room_id),
      )

      // Also check if the same booking number is already imported
      const { data: existingExternal } = await supabase
        .from('reservations')
        .select('id')
        .eq('external_id', entry.bookingNumber)
        .limit(1)

      const alreadyImported = (existingExternal?.length ?? 0) > 0

      const availableRooms = filterAvailableRooms(
        allRooms,
        bookedForThisEntry,
        entry.dbCategory,
        new Set(), // don't restrict by usedInImport for dropdown options
      )

      // Suggest: first available room not used yet in this import
      const suggested = availableRooms.find(r => !usedInImport.has(r.id)) ?? availableRooms[0] ?? null
      if (suggested) usedInImport.add(suggested.id)

      importRows.push({
        ...entry,
        tempId,
        availableRooms,
        suggestedRoomId: alreadyImported ? '__DUPLICATE__' : (suggested?.id ?? null),
      })
    }

    return NextResponse.json({ rows: importRows, rawText: rawText.slice(0, 2000) })
  } catch (err: any) {
    console.error('PDF parse error:', err)
    return NextResponse.json({ error: `Fehler beim Parsen: ${err?.message ?? 'Unbekannter Fehler'}` }, { status: 500 })
  }
}
