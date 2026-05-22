'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'

interface OrderItem {
  id: string
  menu_item_name: string
  quantity: number
  price_at_order: number
}

interface RoomOrder {
  id: string
  room_number: string
  status: 'new' | 'preparing' | 'delivered' | 'cancelled'
  total_price: number | null
  guest_notes: string | null
  created_at: string
  order_items: OrderItem[]
}

const STATUS_CONFIG = {
  new:       { label: 'Neu',           bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  preparing: { label: 'In Zubereitung', bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  delivered: { label: 'Geliefert',     bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500' },
  cancelled: { label: 'Storniert',     bg: 'bg-slate-100',  text: 'text-slate-500',  dot: 'bg-slate-400' },
}

const NEXT_STATUS: Record<string, string> = {
  new:       'preparing',
  preparing: 'delivered',
}

const NEXT_LABEL: Record<string, string> = {
  new:       '👨‍🍳 In Zubereitung',
  preparing: '✅ Als geliefert markieren',
}

/** Two-tone notification beep via Web Audio API */
function playNotification() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    ;[0, 0.25].forEach((delay, i) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type            = 'sine'
      osc.frequency.value = i === 0 ? 880 : 1100
      gain.gain.setValueAtTime(0.4, ctx.currentTime + delay)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.35)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + 0.35)
    })
  } catch (_) { /* audio blocked */ }
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)  return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  return `${Math.floor(diff / 3600)}h`
}

export default function ServiceOrdersPage() {
  const supabase                      = createClient()
  const [orders, setOrders]           = useState<RoomOrder[]>([])
  const [loading, setLoading]         = useState(true)
  const [soundOn, setSoundOn]         = useState(true)
  const [liveCount, setLiveCount]     = useState(0)
  const soundRef                      = useRef(soundOn)
  soundRef.current                    = soundOn

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('room_orders')
      .select('*, order_items(id, menu_item_name, quantity, price_at_order)')
      .order('created_at', { ascending: false })
      .limit(100)

    if (data) setOrders(data as RoomOrder[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchOrders()

    // Real-time subscription
    const channel = supabase
      .channel('room_orders_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_orders' },
        () => {
          if (soundRef.current) playNotification()
          setLiveCount(n => n + 1)
          fetchOrders()
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchOrders, supabase])

  async function updateStatus(orderId: string, newStatus: string) {
    await supabase
      .from('room_orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId)
    setOrders(prev =>
      prev.map(o => o.id === orderId ? { ...o, status: newStatus as any } : o),
    )
  }

  const activeOrders   = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled')
  const historyOrders  = orders.filter(o => o.status === 'delivered' || o.status === 'cancelled')

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">Zimmerservice Bestellungen</h1>
          {activeOrders.length > 0 && (
            <span className="bg-blue-600 text-white text-xs font-bold rounded-full px-2.5 py-1">
              {activeOrders.length} aktiv
            </span>
          )}
          {/* Live pulse indicator */}
          <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        </div>
        <button
          onClick={() => setSoundOn(s => !s)}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            soundOn
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-500',
          )}
        >
          {soundOn ? '🔔 Ton an' : '🔕 Ton aus'}
        </button>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-8">

        {/* ── Active orders ── */}
        {loading ? (
          <p className="text-slate-400 text-sm">Lade Bestellungen…</p>
        ) : activeOrders.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <p className="text-4xl mb-3">🍽️</p>
            <p className="font-medium">Keine aktiven Bestellungen</p>
            <p className="text-sm mt-1">Neue Bestellungen erscheinen hier automatisch.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Aktive Bestellungen</h2>
            {activeOrders.map(order => {
              const cfg = STATUS_CONFIG[order.status]
              return (
                <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  {/* Card header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-900 text-white rounded-xl px-3 py-1.5 font-bold text-lg">
                        Zi. {order.room_number}
                      </div>
                      <span className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', cfg.bg, cfg.text)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                        {cfg.label}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">{timeAgo(order.created_at)} ago</span>
                  </div>

                  {/* Items */}
                  <div className="px-5 py-3 space-y-1.5">
                    {order.order_items.map(item => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700">
                          <span className="font-semibold text-slate-900">{item.quantity}×</span> {item.menu_item_name}
                        </span>
                        <span className="text-slate-500">€{(item.price_at_order * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    {order.guest_notes && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                        💬 {order.guest_notes}
                      </p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-100">
                    <span className="font-bold text-slate-900">
                      Gesamt: €{order.total_price?.toFixed(2) ?? '—'}
                    </span>
                    <div className="flex gap-2">
                      {NEXT_STATUS[order.status] && (
                        <button
                          onClick={() => updateStatus(order.id, NEXT_STATUS[order.status])}
                          className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-700 transition-colors"
                        >
                          {NEXT_LABEL[order.status]}
                        </button>
                      )}
                      <button
                        onClick={() => updateStatus(order.id, 'cancelled')}
                        className="rounded-xl bg-slate-100 text-slate-500 px-4 py-2 text-sm font-medium hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        Stornieren
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── History ── */}
        {historyOrders.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Verlauf</h2>
            {historyOrders.map(order => {
              const cfg = STATUS_CONFIG[order.status]
              return (
                <div key={order.id} className="bg-white rounded-xl border border-slate-200 px-5 py-3 flex items-center justify-between opacity-60">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-700">Zi. {order.room_number}</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', cfg.bg, cfg.text)}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-500">
                      {order.order_items.length} Artikel · €{order.total_price?.toFixed(2) ?? '—'}
                    </span>
                    <span className="text-xs text-slate-400">{timeAgo(order.created_at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
