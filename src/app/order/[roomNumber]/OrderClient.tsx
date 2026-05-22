'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface MenuItem {
  id: string
  name: string
  description: string | null
  price: number
  category: string
  is_available: boolean
}

interface Room {
  room_id: string
  room_name: string
  room_number: string
}

export default function OrderClient({
  room,
  menuItems,
  token,
}: {
  room: Room
  menuItems: MenuItem[]
  token: string
}) {
  const supabase = createClient()

  const [cart, setCart]         = useState<Record<string, number>>({})
  const [notes, setNotes]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderId, setOrderId]   = useState<string | null>(null)
  const [error, setError]       = useState('')

  const categories = [...new Set(menuItems.map(i => i.category))]
  const totalItems = Object.values(cart).reduce((a, b) => a + b, 0)
  const totalPrice = menuItems
    .filter(i => cart[i.id])
    .reduce((sum, i) => sum + i.price * (cart[i.id] || 0), 0)

  function setQty(itemId: string, delta: number) {
    setCart(prev => {
      const next = { ...prev }
      const current = next[itemId] ?? 0
      const updated = current + delta
      if (updated <= 0) delete next[itemId]
      else next[itemId] = updated
      return next
    })
  }

  async function handleSubmit() {
    if (totalItems === 0) return
    setSubmitting(true)
    setError('')

    const items = Object.entries(cart).map(([menu_item_id, quantity]) => ({
      menu_item_id,
      quantity,
    }))

    const { data, error: rpcErr } = await supabase.rpc('place_room_order', {
      p_room_number: room.room_number,
      p_token:       token,
      p_items:       items,
      p_guest_notes: notes || null,
    })

    if (rpcErr) {
      setError('Bestellung konnte nicht gesendet werden. Bitte versuchen Sie es erneut.')
      setSubmitting(false)
      return
    }

    setOrderId(data as string)
    setSubmitting(false)

    // Fire push notification to all staff devices (best-effort)
    fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomNumber: room.room_number }),
    }).catch(() => {})
  }

  if (orderId) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-6">✅</div>
        <h1 className="text-2xl font-bold text-white mb-2">Bestellung eingegangen!</h1>
        <p className="text-slate-300 text-sm leading-relaxed">
          Wir bringen Ihre Bestellung<br />so schnell wie möglich zu <strong>{room.room_name}</strong>.
        </p>
        <p className="text-slate-600 text-xs mt-6">
          Bestell-Nr.: {(orderId as string).slice(0, 8).toUpperCase()}
        </p>
        <button
          onClick={() => { setOrderId(null); setCart({}); setNotes('') }}
          className="mt-8 bg-slate-700 hover:bg-slate-600 active:scale-95 text-white rounded-2xl px-6 py-3 text-sm font-semibold transition-all"
        >
          🍽️ Weitere Bestellung aufgeben
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="bg-slate-900 text-white px-5 py-5 sticky top-0 z-20 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">🍽️ Zimmerservice</p>
            <h1 className="text-lg font-bold leading-tight">{room.room_name}</h1>
          </div>
          {totalItems > 0 && (
            <div className="bg-blue-600 text-white rounded-full px-3 py-1 text-sm font-bold">
              {totalItems} im Warenkorb
            </div>
          )}
        </div>
      </div>

      {/* ── Menu ───────────────────────────────────────────────────── */}
      <div className="pb-36 px-4 pt-5 space-y-7 max-w-lg mx-auto">
        {categories.map(category => {
          const items = menuItems.filter(i => i.category === category)
          return (
            <section key={category}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3 pl-1">
                {category}
              </h2>
              <div className="space-y-3">
                {items.map(item => (
                  <div
                    key={item.id}
                    className={`bg-white rounded-2xl p-4 shadow-sm transition-opacity ${
                      !item.is_available ? 'opacity-40' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm leading-tight">
                          {item.name}
                        </p>
                        {item.description && (
                          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                        <p className="text-sm font-bold text-slate-800 mt-2">
                          €{item.price.toFixed(2)}
                        </p>
                      </div>

                      <div className="flex-shrink-0 flex items-center gap-2 mt-1">
                        {!item.is_available ? (
                          <span className="text-xs text-red-400 font-medium">Ausverkauft</span>
                        ) : cart[item.id] ? (
                          <>
                            <button
                              onClick={() => setQty(item.id, -1)}
                              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 text-xl font-bold leading-none"
                            >
                              −
                            </button>
                            <span className="w-5 text-center font-bold text-slate-900 text-sm">
                              {cart[item.id]}
                            </span>
                            <button
                              onClick={() => setQty(item.id, +1)}
                              className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white text-xl font-bold leading-none"
                            >
                              +
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setQty(item.id, +1)}
                            className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white text-xl font-bold leading-none"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}

        {/* Notes field — only show once something is in cart */}
        {totalItems > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3 pl-1">
              Anmerkungen
            </h2>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Allergien, Sonderwünsche…"
              rows={3}
              className="w-full bg-white rounded-2xl p-4 shadow-sm text-sm text-slate-700 placeholder:text-slate-400 outline-none resize-none"
            />
          </section>
        )}
      </div>

      {/* ── Sticky order bar ───────────────────────────────────────── */}
      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur border-t border-slate-200 z-30">
          {error && (
            <p className="text-red-500 text-xs text-center mb-2">{error}</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full max-w-lg mx-auto flex bg-slate-900 text-white rounded-2xl py-4 px-5 font-semibold text-sm items-center justify-between disabled:opacity-60 active:scale-[0.98] transition-transform"
          >
            <span className="bg-white text-slate-900 rounded-full w-7 h-7 flex items-center justify-center text-xs font-black">
              {totalItems}
            </span>
            <span className="text-base">
              {submitting ? 'Wird gesendet…' : 'Jetzt bestellen'}
            </span>
            <span className="font-bold text-base">€{totalPrice.toFixed(2)}</span>
          </button>
        </div>
      )}
    </div>
  )
}
