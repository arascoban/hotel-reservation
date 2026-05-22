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
    <>
      <style>{`
        @media print {
          .no-print   { display: none !important; }
          .qr-page    { page-break-after: always; break-after: page; }
          .qr-page:last-child { page-break-after: avoid; break-after: avoid; }
          body        { background: white !important; margin: 0 !important; }
          @page       { size: A4 portrait; margin: 0; }
        }
      `}</style>

      {/* ── Screen toolbar ── */}
      <div className="no-print bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">QR-Codes Zimmerservice</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Jeden QR-Code ausdrucken und im jeweiligen Zimmer aufstellen.
          </p>
        </div>
        <PrintAllButton />
      </div>

      {/* ── Screen preview grid ── */}
      <div className="no-print p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {(rooms ?? []).map((room: RoomWithToken) => {
            const orderUrl = `${BASE_URL}/order/${room.room_number}?t=${room.order_token}`
            const qrUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(orderUrl)}`
            return (
              <div key={room.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col items-center gap-2 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl} alt={room.name} width={140} height={140} className="rounded-lg" />
                <p className="font-bold text-slate-900 text-sm">{room.name}</p>
                <p className="text-xs text-slate-400">Zimmer {room.room_number}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Print pages (one full A4 per room, hidden on screen) ── */}
      <div className="hidden print:block">
        {(rooms ?? []).map((room: RoomWithToken) => {
          const orderUrl = `${BASE_URL}/order/${room.room_number}?t=${room.order_token}`
          const qrUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=16&data=${encodeURIComponent(orderUrl)}`
          return (
            <div
              key={room.id}
              className="qr-page w-full h-screen flex flex-col items-center justify-center bg-white"
              style={{ minHeight: '297mm' }}
            >
              {/* Logo */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://i.ibb.co/m597972B/logo.png"
                alt="Jägerstieg Hotel & Pension"
                width={160}
                height={80}
                style={{ objectFit: 'contain', marginBottom: '24px' }}
              />

              {/* Big QR code */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrUrl}
                alt={room.name}
                width={260}
                height={260}
                className="rounded-2xl shadow-lg"
              />

              {/* Room name */}
              <p className="mt-8 text-4xl font-black text-slate-900">{room.name}</p>

              {/* Catchy headline */}
              <p className="mt-3 text-2xl font-bold text-slate-700">🍽️ Zimmerservice</p>
              <p className="mt-2 text-base text-slate-500 text-center max-w-xs leading-relaxed">
                Einfach QR-Code scannen und<br />direkt aus Ihrem Zimmer bestellen!
              </p>

              {/* Divider */}
              <div className="mt-8 w-24 h-px bg-slate-200" />

              {/* Payment info */}
              <p className="mt-5 text-sm font-semibold text-slate-600 text-center">
                💳 Bezahlung bei Check-out
              </p>
              <p className="mt-1 text-sm text-slate-400 text-center">
                Bar · EC-Karte · Kreditkarte
              </p>

              {/* Footer */}
              <p className="mt-6 text-xs text-slate-300 text-center">
                Wir bringen Ihre Bestellung direkt zu Ihrer Zimmertür.
              </p>
            </div>
          )
        })}
      </div>
    </>
  )
}
