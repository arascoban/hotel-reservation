import { createClient } from '@/lib/supabase/server'
import OrderClient from './OrderClient'

export const dynamic = 'force-dynamic'

interface MenuItem {
  id: string
  name: string
  description: string | null
  price: number
  category: string
  is_available: boolean
  sort_order: number
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: { roomNumber: string }
  searchParams: { t?: string }
}) {
  const token = searchParams.t
  const { roomNumber } = params

  if (!token) return <InvalidQR />

  const supabase = await createClient()

  // Validate token server-side via SECURITY DEFINER RPC
  const { data: roomData } = await supabase.rpc('validate_room_token', {
    p_room_number: roomNumber,
    p_token:       token,
  })

  if (!roomData || roomData.length === 0) return <InvalidQR />

  const room = roomData[0] as { room_id: string; room_name: string; room_number: string }

  // Fetch current reservation to get checkout date (limits cleaning date picker)
  const { data: resData } = await supabase
    .from('reservations')
    .select('checkout_at')
    .eq('room_id', room.room_id)
    .not('status', 'in', '("cancelled","no_show","checked_out")')
    .is('deleted_at', null)
    .gte('checkout_at', new Date().toISOString())
    .order('checkin_at')
    .limit(1)

  const checkoutDate = resData?.[0]?.checkout_at
    ? resData[0].checkout_at.slice(0, 10)   // YYYY-MM-DD
    : null

  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id, name, description, price, category, is_available, sort_order')
    .order('sort_order')

  return (
    <OrderClient
      room={room}
      menuItems={(menuItems ?? []) as MenuItem[]}
      token={token}
      checkoutDate={checkoutDate}
    />
  )
}

function InvalidQR() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-5xl mb-5">🔒</p>
        <h1 className="text-xl font-bold text-white mb-2">Ungültiger QR-Code</h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          Bitte scannen Sie den QR-Code<br />in Ihrem Zimmer.
        </p>
      </div>
    </div>
  )
}
