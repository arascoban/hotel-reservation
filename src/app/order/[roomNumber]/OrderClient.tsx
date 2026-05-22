'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, addDays, parseISO, differenceInCalendarDays } from 'date-fns'
import { de } from 'date-fns/locale'

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

type Mode = 'home' | 'food' | 'cleaning'

const TIME_OPTIONS = [
  { value: 'now',       label: 'Jetzt (sofort)', emoji: '⚡' },
  { value: 'morning',   label: 'Vormittag',       emoji: '🌅', sub: '08:00 – 12:00' },
  { value: 'afternoon', label: 'Nachmittag',      emoji: '☀️',  sub: '12:00 – 17:00' },
  { value: 'evening',   label: 'Abend',           emoji: '🌆', sub: '17:00 – 20:00' },
]

export default function OrderClient({
  room,
  menuItems,
  token,
  checkoutDate,
}: {
  room: Room
  menuItems: MenuItem[]
  token: string
  checkoutDate: string | null   // YYYY-MM-DD
}) {
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>('home')

  // ── Food state ───────────────────────────────────────────────
  const [cart, setCart]               = useState<Record<string, number>>({})
  const [notes, setNotes]             = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [orderId, setOrderId]         = useState<string | null>(null)
  const [foodError, setFoodError]     = useState('')

  // ── Cleaning state ───────────────────────────────────────────
  const [cleanDate, setCleanDate]     = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [cleanTime, setCleanTime]     = useState<string>('now')
  const [cleanSubmitting, setCleanSubmitting] = useState(false)
  const [cleanDone, setCleanDone]     = useState(false)
  const [cleanError, setCleanError]   = useState('')

  // Dates guest can choose: today … day before checkout
  const availableDates = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dates: { value: string; label: string }[] = []

    const maxDays = checkoutDate
      ? differenceInCalendarDays(parseISO(checkoutDate), today)   // up to but NOT including checkout day
      : 3   // fallback if no active reservation found

    for (let i = 0; i < Math.max(1, maxDays); i++) {
      const d = addDays(today, i)
      const value = format(d, 'yyyy-MM-dd')
      const label = i === 0 ? 'Heute' : i === 1 ? 'Morgen' : format(d, 'EEEE, d. MMM', { locale: de })
      dates.push({ value, label })
    }
    return dates
  }, [checkoutDate])

  // ── Food helpers ─────────────────────────────────────────────
  const categories  = [...new Set(menuItems.map(i => i.category))]
  const totalItems  = Object.values(cart).reduce((a, b) => a + b, 0)
  const totalPrice  = menuItems
    .filter(i => cart[i.id])
    .reduce((sum, i) => sum + i.price * (cart[i.id] || 0), 0)

  function setQty(itemId: string, delta: number) {
    setCart(prev => {
      const next = { ...prev }
      const updated = (next[itemId] ?? 0) + delta
      if (updated <= 0) delete next[itemId]
      else next[itemId] = updated
      return next
    })
  }

  async function handleFoodSubmit() {
    if (totalItems === 0) return
    setSubmitting(true)
    setFoodError('')

    const items = Object.entries(cart).map(([menu_item_id, quantity]) => ({ menu_item_id, quantity }))

    const { data, error } = await supabase.rpc('place_room_order', {
      p_room_number: room.room_number,
      p_token:       token,
      p_items:       items,
      p_guest_notes: notes || null,
    })

    if (error) {
      setFoodError('Bestellung konnte nicht gesendet werden. Bitte versuchen Sie es erneut.')
      setSubmitting(false)
      return
    }

    setOrderId(data as string)
    setSubmitting(false)

    fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomNumber: room.room_number }),
    }).catch(() => {})
  }

  async function handleCleanSubmit() {
    setCleanSubmitting(true)
    setCleanError('')

    const res = await fetch('/api/cleaning-request', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomNumber:     room.room_number,
        roomId:         room.room_id,
        requestDate:    cleanDate,
        timePreference: cleanTime,
        token,
      }),
    })
    const json = await res.json()

    if (!res.ok) {
      setCleanError(json.error ?? 'Anfrage konnte nicht gesendet werden.')
      setCleanSubmitting(false)
      return
    }

    setCleanDone(true)
    setCleanSubmitting(false)
  }

  function goHome() {
    setMode('home')
    setOrderId(null)
    setCart({})
    setNotes('')
    setFoodError('')
    setCleanDone(false)
    setCleanError('')
    setCleanDate(format(new Date(), 'yyyy-MM-dd'))
    setCleanTime('now')
  }

  // ── HOME ─────────────────────────────────────────────────────
  if (mode === 'home') return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        {/* Hotel header */}
        <div className="text-center mb-8">
          <p className="text-slate-400 text-xs uppercase tracking-widest mb-1">Jägerstieg Hotel & Pension</p>
          <h1 className="text-xl font-bold text-white">{room.room_name}</h1>
          <p className="text-slate-500 text-sm mt-1">Wie können wir Ihnen helfen?</p>
        </div>

        {/* Room Service button */}
        <button
          onClick={() => setMode('food')}
          className="w-full flex items-center gap-5 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] rounded-2xl p-5 text-left transition-all shadow-lg"
        >
          <span className="text-4xl flex-shrink-0">🍽️</span>
          <div>
            <p className="text-white font-bold text-base leading-tight">Zimmerservice</p>
            <p className="text-slate-400 text-sm mt-0.5">Essen & Getränke bestellen</p>
          </div>
        </button>

        {/* Room Cleaning button */}
        <button
          onClick={() => setMode('cleaning')}
          className="w-full flex items-center gap-5 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] rounded-2xl p-5 text-left transition-all shadow-lg"
        >
          <span className="text-4xl flex-shrink-0">🧹</span>
          <div>
            <p className="text-white font-bold text-base leading-tight">Zimmerreinigung</p>
            <p className="text-slate-400 text-sm mt-0.5">Reinigung anfragen</p>
          </div>
        </button>
      </div>
    </div>
  )

  // ── FOOD — Success ────────────────────────────────────────────
  if (mode === 'food' && orderId) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-6">✅</div>
      <h1 className="text-2xl font-bold text-white mb-2">Bestellung eingegangen!</h1>
      <p className="text-slate-300 text-sm leading-relaxed">
        Wir bringen Ihre Bestellung<br />so schnell wie möglich zu <strong>{room.room_name}</strong>.
      </p>
      <p className="text-slate-600 text-xs mt-6">Bestell-Nr.: {orderId.slice(0, 8).toUpperCase()}</p>
      <div className="flex flex-col gap-3 mt-8 w-full max-w-xs">
        <button
          onClick={() => { setOrderId(null); setCart({}); setNotes('') }}
          className="bg-slate-700 hover:bg-slate-600 active:scale-95 text-white rounded-2xl px-6 py-3 text-sm font-semibold transition-all"
        >
          🍽️ Weitere Bestellung aufgeben
        </button>
        <button
          onClick={goHome}
          className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 rounded-2xl px-6 py-3 text-sm font-medium transition-all"
        >
          ← Zurück zur Startseite
        </button>
      </div>
    </div>
  )

  // ── FOOD — Menu ───────────────────────────────────────────────
  if (mode === 'food') return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-slate-900 text-white px-5 py-5 sticky top-0 z-20 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={goHome} className="text-slate-400 hover:text-white transition-colors text-sm">
              ←
            </button>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">🍽️ Zimmerservice</p>
              <h1 className="text-lg font-bold leading-tight">{room.room_name}</h1>
            </div>
          </div>
          {totalItems > 0 && (
            <div className="bg-blue-600 text-white rounded-full px-3 py-1 text-sm font-bold">
              {totalItems} im Warenkorb
            </div>
          )}
        </div>
      </div>

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
                    className={`bg-white rounded-2xl p-4 shadow-sm transition-opacity ${!item.is_available ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm leading-tight">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{item.description}</p>
                        )}
                        <p className="text-sm font-bold text-slate-800 mt-2">€{item.price.toFixed(2)}</p>
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-2 mt-1">
                        {!item.is_available ? (
                          <span className="text-xs text-red-400 font-medium">Ausverkauft</span>
                        ) : cart[item.id] ? (
                          <>
                            <button onClick={() => setQty(item.id, -1)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 text-xl font-bold leading-none">−</button>
                            <span className="w-5 text-center font-bold text-slate-900 text-sm">{cart[item.id]}</span>
                            <button onClick={() => setQty(item.id, +1)} className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white text-xl font-bold leading-none">+</button>
                          </>
                        ) : (
                          <button onClick={() => setQty(item.id, +1)} className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white text-xl font-bold leading-none">+</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )
        })}

        {totalItems > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3 pl-1">Anmerkungen</h2>
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

      {totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur border-t border-slate-200 z-30">
          {foodError && <p className="text-red-500 text-xs text-center mb-2">{foodError}</p>}
          <button
            onClick={handleFoodSubmit}
            disabled={submitting}
            className="w-full max-w-lg mx-auto flex bg-slate-900 text-white rounded-2xl py-4 px-5 font-semibold text-sm items-center justify-between disabled:opacity-60 active:scale-[0.98] transition-transform"
          >
            <span className="bg-white text-slate-900 rounded-full w-7 h-7 flex items-center justify-center text-xs font-black">{totalItems}</span>
            <span className="text-base">{submitting ? 'Wird gesendet…' : 'Jetzt bestellen'}</span>
            <span className="font-bold text-base">€{totalPrice.toFixed(2)}</span>
          </button>
        </div>
      )}
    </div>
  )

  // ── CLEANING — Success ────────────────────────────────────────
  if (mode === 'cleaning' && cleanDone) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
      <div className="text-6xl mb-6">✅</div>
      <h1 className="text-2xl font-bold text-white mb-2">Anfrage eingegangen!</h1>
      <p className="text-slate-300 text-sm leading-relaxed">
        Wir kümmern uns um die Reinigung<br />von <strong>{room.room_name}</strong>.
      </p>
      <button
        onClick={goHome}
        className="mt-8 bg-slate-700 hover:bg-slate-600 active:scale-95 text-white rounded-2xl px-6 py-3 text-sm font-semibold transition-all"
      >
        ← Zurück zur Startseite
      </button>
    </div>
  )

  // ── CLEANING — Form ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="px-5 py-5 flex items-center gap-3">
        <button onClick={goHome} className="text-slate-400 hover:text-white transition-colors text-lg leading-none">←</button>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest">🧹 Zimmerreinigung</p>
          <h1 className="text-base font-bold text-white leading-tight">{room.room_name}</h1>
        </div>
      </div>

      <div className="flex-1 px-5 py-4 max-w-sm mx-auto w-full space-y-7">

        {/* Date selection */}
        <div>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
            Wann soll gereinigt werden?
          </p>
          {availableDates.length === 0 ? (
            <p className="text-slate-500 text-sm">Keine Reinigung mehr möglich (Abreise heute).</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableDates.map(d => (
                <button
                  key={d.value}
                  onClick={() => setCleanDate(d.value)}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-95 ${
                    cleanDate === d.value
                      ? 'bg-white text-slate-900'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Time preference */}
        <div>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
            Uhrzeit / Zeitraum
          </p>
          <div className="space-y-2">
            {TIME_OPTIONS.map(t => (
              <button
                key={t.value}
                onClick={() => setCleanTime(t.value)}
                className={`w-full flex items-center gap-4 rounded-2xl px-4 py-3.5 text-left transition-all active:scale-[0.98] ${
                  cleanTime === t.value
                    ? 'bg-white'
                    : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                <span className="text-2xl flex-shrink-0">{t.emoji}</span>
                <div>
                  <p className={`font-semibold text-sm leading-tight ${cleanTime === t.value ? 'text-slate-900' : 'text-slate-200'}`}>
                    {t.label}
                  </p>
                  {t.sub && (
                    <p className={`text-xs mt-0.5 ${cleanTime === t.value ? 'text-slate-500' : 'text-slate-500'}`}>
                      {t.sub}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {cleanError && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">
            {cleanError}
          </div>
        )}

        {/* Submit */}
        {availableDates.length > 0 && (
          <button
            onClick={handleCleanSubmit}
            disabled={cleanSubmitting}
            className="w-full bg-white text-slate-900 rounded-2xl py-4 font-bold text-base active:scale-[0.98] disabled:opacity-60 transition-all"
          >
            {cleanSubmitting ? 'Wird gesendet…' : '🧹 Reinigung anfragen'}
          </button>
        )}
      </div>
    </div>
  )
}
