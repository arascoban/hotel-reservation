import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { roomNumber, roomId, requestDate, timePreference, token } = await req.json()

    if (!roomNumber || !requestDate || !timePreference || !token) {
      return NextResponse.json({ error: 'Fehlende Pflichtfelder.' }, { status: 400 })
    }

    const supabase = await createClient()

    // Validate QR token so guests can't spoof other rooms
    const { data: roomData } = await supabase.rpc('validate_room_token', {
      p_room_number: roomNumber,
      p_token: token,
    })
    if (!roomData || roomData.length === 0) {
      return NextResponse.json({ error: 'Ungültiger QR-Code.' }, { status: 403 })
    }

    // Check 1-per-day limit: is there already a request for this room on this date?
    const { data: existing } = await supabase
      .from('cleaning_requests')
      .select('id, status')
      .eq('room_number', roomNumber)
      .eq('request_date', requestDate)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: 'Für dieses Zimmer wurde heute bereits eine Reinigung angefragt.' },
        { status: 409 },
      )
    }

    // Insert the request (unique index on room_number+request_date is the safety net)
    const { data, error } = await supabase
      .from('cleaning_requests')
      .insert({
        room_number:     roomNumber,
        room_id:         roomId ?? null,
        request_date:    requestDate,
        time_preference: timePreference,
        status:          'pending',
      })
      .select('id')
      .single()

    if (error) {
      // Unique constraint violation = already exists
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Für dieses Zimmer wurde heute bereits eine Reinigung angefragt.' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ id: data.id })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Unbekannter Fehler' }, { status: 500 })
  }
}
