import { createClient } from '@/lib/supabase/server'
import PrintAllButton from './PrintAllButton'

const BASE_URL = 'https://jaegerstieg-reservation.vercel.app'

export const dynamic = 'force-dynamic'

interface RoomWithToken {
  id: string
  room_number: string
  name: string
  order_token: string
}

export default async function QRCodesPage() {
  const supabase = await createClient()

  const { data: rooms } = await supabase
    .from('rooms')
    .select('id, room_number, name, order_token')
    .eq('is_active', true)
    .order('sort_order')

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <div className="no-print bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">QR-Codes Zimmerservice</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Jeden QR-Code ausdrucken und im jeweiligen Zimmer aufstellen.
          </p>
        </div>
        <PrintAllButton />
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .qr-card { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

      {/* ── QR grid ── */}
      <div className="p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
          {(rooms ?? []).map((room: RoomWithToken) => {
            const orderUrl  = `${BASE_URL}/order/${room.room_number}?t=${room.order_token}`
            const qrImgUrl  = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(orderUrl)}`

            return (
              <div
                key={room.id}
                className="qr-card bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col items-center gap-3"
              >
                {/* QR code image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrImgUrl}
                  alt={`QR Code ${room.name}`}
                  width={180}
                  height={180}
                  className="rounded-lg"
                />

                {/* Room info */}
                <div className="text-center">
                  <p className="font-bold text-slate-900 text-base">{room.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Zimmer {room.room_number}</p>
                </div>

                {/* Instruction text */}
                <div className="bg-slate-50 rounded-xl px-3 py-2 text-center">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    QR-Code scannen<br />für Zimmerservice
                  </p>
                </div>

                {/* URL (tiny, for debugging) */}
                <p className="text-2xs text-slate-300 break-all text-center hidden">
                  {orderUrl}
                </p>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
