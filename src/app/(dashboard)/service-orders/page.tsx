'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { cn } from '@/lib/cn'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderItem {
  id:             string
  menu_item_name: string
  quantity:       number
  price_at_order: number
}

interface RoomOrder {
  id:          string
  room_number: string
  status:      'new' | 'preparing' | 'delivered' | 'cancelled'
  total_price: number | null
  guest_notes: string | null
  created_at:  string
  paid_at:     string | null
  order_items: OrderItem[]
}

interface Room {
  id:          string
  room_number: string
  name:        string
  sort_order:  number
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  new:       { label: 'Neu',            bg: 'bg-blue-100',  text: 'text-blue-700',  dot: 'bg-blue-500'  },
  preparing: { label: 'In Zubereitung', bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  delivered: { label: 'Geliefert',      bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  cancelled: { label: 'Storniert',      bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400' },
}

const NEXT_STATUS: Record<string, string> = { new: 'preparing', preparing: 'delivered' }
const NEXT_LABEL:  Record<string, string> = {
  new:       '👨‍🍳 In Zubereitung',
  preparing: '✅ Geliefert',
}

const ADMIN_EMAIL = 'arascoban36@gmail.com'

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)   return `vor ${diff}s`
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} min`
  return `vor ${Math.floor(diff / 3600)} h`
}

// ── Order card ────────────────────────────────────────────────────────────────

function OrderCard({
  order, onStatusChange, onDelete, isAdmin, confirmingDelete, onConfirmDelete, onCancelDelete,
}: {
  order:            RoomOrder
  onStatusChange:   (id: string, status: string) => void
  onDelete:         (id: string) => void
  isAdmin:          boolean
  confirmingDelete: boolean
  onConfirmDelete:  () => void
  onCancelDelete:   () => void
}) {
  const cfg    = STATUS_CONFIG[order.status]
  const isDone = order.status === 'delivered' || order.status === 'cancelled'

  return (
    <div className={cn(
      'bg-white rounded-2xl shadow-sm border overflow-hidden transition-all',
      order.status === 'new'       && 'border-blue-300 shadow-blue-100',
      order.status === 'preparing' && 'border-amber-200',
      isDone                       && 'border-slate-200 opacity-60',
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <span className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', cfg.bg, cfg.text)}>
          <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
          {cfg.label}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{timeAgo(order.created_at)}</span>
          {isAdmin && (
            confirmingDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-red-600 font-semibold">Löschen?</span>
                <button onClick={onConfirmDelete} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-bold text-white hover:bg-red-700 transition-colors">Ja</button>
                <button onClick={onCancelDelete}  className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors">Nein</button>
              </div>
            ) : (
              <button onClick={() => onDelete(order.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors" title="Bestellung löschen">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>
      </div>

      {/* Items */}
      <div className="px-5 py-3 space-y-1.5">
        {order.order_items.map(item => (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span className="text-slate-700"><span className="font-semibold text-slate-900">{item.quantity}×</span> {item.menu_item_name}</span>
            <span className="text-slate-500">€{(item.price_at_order * item.quantity).toFixed(2)}</span>
          </div>
        ))}
        {order.guest_notes && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">💬 {order.guest_notes}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-100">
        <span className="font-bold text-slate-900">€{order.total_price?.toFixed(2) ?? '—'}</span>
        {!isDone && (
          <div className="flex gap-2">
            {NEXT_STATUS[order.status] && (
              <button onClick={() => onStatusChange(order.id, NEXT_STATUS[order.status])}
                className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-700 transition-colors">
                {NEXT_LABEL[order.status]}
              </button>
            )}
            <button onClick={() => onStatusChange(order.id, 'cancelled')}
              className="rounded-xl bg-slate-100 text-slate-500 px-4 py-2 text-sm font-medium hover:bg-red-50 hover:text-red-600 transition-colors">
              Stornieren
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ServiceOrdersPage() {
  const supabase = createClient()

  const [rooms,           setRooms]           = useState<Room[]>([])
  const [orders,          setOrders]          = useState<RoomOrder[]>([])
  const [loading,         setLoading]         = useState(true)
  const [selectedRoom,    setSelectedRoom]    = useState<string | null>(null)
  const [userEmail,       setUserEmail]       = useState<string | null>(null)
  const [confirmDelete,   setConfirmDelete]   = useState<string | null>(null)
  const [confirmPayment,  setConfirmPayment]  = useState(false)
  const [payingRoom,      setPayingRoom]      = useState(false)
  const [showArchive,          setShowArchive]          = useState(false)
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<string | null>(null) // archive key
  const [confirmDeleteAll,     setConfirmDeleteAll]     = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)

  const isAdmin = userEmail === ADMIN_EMAIL

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null))
  }, [supabase])

  const fetchOrders = useCallback(async () => {
    const { data } = await supabase
      .from('room_orders')
      .select('*, order_items(id, menu_item_name, quantity, price_at_order)')
      .order('created_at', { ascending: false })
      .limit(1000)
    if (data) setOrders(data as RoomOrder[])
    setLoading(false)
  }, [supabase])

  const fetchRooms = useCallback(async () => {
    const { data } = await supabase
      .from('rooms')
      .select('id, room_number, name, sort_order')
      .eq('is_active', true)
      .order('sort_order')
    if (data) setRooms(data as Room[])
  }, [supabase])

  useEffect(() => {
    fetchRooms()
    fetchOrders()

    const channel = supabase
      .channel('service_orders_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_orders' }, fetchOrders)
      .subscribe()

    const poll = setInterval(fetchOrders, 20_000)
    return () => { supabase.removeChannel(channel); clearInterval(poll) }
  }, [fetchOrders, fetchRooms, supabase])

  async function updateStatus(orderId: string, newStatus: string) {
    await supabase
      .from('room_orders')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus as any } : o))
  }

  async function deleteOrder(orderId: string) {
    await supabase.from('room_orders').delete().eq('id', orderId)
    setOrders(prev => prev.filter(o => o.id !== orderId))
    setConfirmDelete(null)
  }

  async function deleteSession(orderIds: string[]) {
    await supabase.from('room_orders').delete().in('id', orderIds)
    setOrders(prev => prev.filter(o => !orderIds.includes(o.id)))
    setConfirmDeleteSession(null)
  }

  async function deleteAllArchive() {
    const ids = paidOrders.map(o => o.id)
    await supabase.from('room_orders').delete().in('id', ids)
    setOrders(prev => prev.filter(o => !o.paid_at))
    setConfirmDeleteAll(false)
    setShowArchive(false)
  }

  // Mark all non-cancelled orders for selected room as paid
  async function markPaymentReceived() {
    if (!selectedRoom) return
    setPayingRoom(true)
    const now = new Date().toISOString()
    await supabase
      .from('room_orders')
      .update({ paid_at: now })
      .eq('room_number', selectedRoom)
      .neq('status', 'cancelled')
      .is('paid_at', null)
    setOrders(prev => prev.map(o =>
      o.room_number === selectedRoom && o.status !== 'cancelled' && !o.paid_at
        ? { ...o, paid_at: now }
        : o,
    ))
    setPayingRoom(false)
    setConfirmPayment(false)
    setSelectedRoom(null)
  }

  function handleRoomClick(roomNumber: string) {
    setSelectedRoom(prev => prev === roomNumber ? null : roomNumber)
    setConfirmPayment(false)
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  // Unpaid orders only (shown in main grid + live feed)
  const unpaidOrders = orders.filter(o => !o.paid_at)
  const paidOrders   = orders.filter(o => !!o.paid_at)

  // Per-room stats (unpaid only)
  const roomStats = new Map<string, { active: number; total: number; hasOrders: boolean; allDelivered: boolean }>()
  for (const o of unpaidOrders) {
    const s        = roomStats.get(o.room_number) ?? { active: 0, total: 0, hasOrders: false, allDelivered: true }
    const isActive = o.status === 'new' || o.status === 'preparing'
    const isBilled = o.status !== 'cancelled'
    roomStats.set(o.room_number, {
      active:       s.active + (isActive ? 1 : 0),
      total:        s.total  + (isBilled ? (o.total_price ?? 0) : 0),
      hasOrders:    true,
      allDelivered: s.allDelivered && !isActive,
    })
  }

  const activeOrders = unpaidOrders.filter(o => o.status === 'new' || o.status === 'preparing')

  // Selected room orders (unpaid)
  const selectedOrders    = selectedRoom ? unpaidOrders.filter(o => o.room_number === selectedRoom) : []
  const selectedActive    = selectedOrders.filter(o => o.status === 'new' || o.status === 'preparing')
  const selectedDelivered = selectedOrders.filter(o => o.status === 'delivered')
  const selectedCancelled = selectedOrders.filter(o => o.status === 'cancelled')
  const selectedTotal     = selectedOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.total_price ?? 0), 0)
  const selectedRoomName  = rooms.find(r => r.room_number === selectedRoom)?.name ?? ''
  const canMarkPaid       = selectedOrders.length > 0 && selectedOrders.some(o => o.status !== 'cancelled')

  // Archive: paid orders grouped by room+date
  const archiveByRoom = new Map<string, { orders: RoomOrder[]; total: number; paidAt: string }>()
  for (const o of paidOrders) {
    const key      = `${o.room_number}::${o.paid_at?.slice(0, 10)}`
    const existing = archiveByRoom.get(key) ?? { orders: [], total: 0, paidAt: o.paid_at ?? '' }
    archiveByRoom.set(key, {
      orders: [...existing.orders, o],
      total:  existing.total + (o.status !== 'cancelled' ? (o.total_price ?? 0) : 0),
      paidAt: o.paid_at ?? '',
    })
  }
  const archiveEntries = [...archiveByRoom.entries()].sort((a, b) =>
    b[1].paidAt.localeCompare(a[1].paidAt),
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-slate-900">Zimmerservice</h1>
        {activeOrders.length > 0 && (
          <span className="bg-blue-600 text-white text-xs font-bold rounded-full px-2.5 py-1">
            {activeOrders.length} aktiv
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Live
        </span>
        {isAdmin && paidOrders.length > 0 && (
          <span className="ml-auto text-xs text-slate-400">{paidOrders.length} archivierte Bestellungen</span>
        )}
      </div>

      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-8">

        {/* ══════════════════════════════════════════════════════════════════
            ROOM GRID
        ══════════════════════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Zimmerübersicht — offene Bestellungen
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {rooms.map(room => {
              const stats      = roomStats.get(room.room_number)
              const isSelected = selectedRoom === room.room_number
              const hasActive  = (stats?.active ?? 0) > 0
              const hasAny     = stats?.hasOrders ?? false
              const allDone    = hasAny && (stats?.allDelivered ?? false)

              return (
                <button
                  key={room.id}
                  onClick={() => handleRoomClick(room.room_number)}
                  className={cn(
                    'relative rounded-xl border-2 p-3 text-left transition-all hover:shadow-md active:scale-95',
                    isSelected  && 'border-blue-500 bg-blue-50 shadow-blue-100 shadow-md',
                    !isSelected && hasActive  && 'border-blue-300 bg-white',
                    !isSelected && allDone    && 'border-amber-300 bg-amber-50',
                    !isSelected && !hasActive && !allDone && hasAny    && 'border-green-200 bg-green-50',
                    !isSelected && !hasAny    && 'border-slate-200 bg-white',
                  )}
                >
                  {hasActive && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[1.25rem] h-5 flex items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold px-1 leading-none">
                      {stats!.active}
                    </span>
                  )}
                  {allDone && !isSelected && (
                    <span className="absolute -top-1.5 -right-1.5 text-base leading-none">💳</span>
                  )}

                  <p className="text-base font-bold text-slate-800 mb-1">Zi. {room.room_number}</p>
                  <p className="text-2xs text-slate-400 truncate mb-2">{room.name}</p>

                  {hasAny ? (
                    <p className={cn('text-sm font-bold', hasActive ? 'text-blue-700' : allDone ? 'text-amber-700' : 'text-green-700')}>
                      €{stats!.total.toFixed(2)}
                    </p>
                  ) : (
                    <p className="text-2xs text-slate-300">Keine Bestellungen</p>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            ROOM DETAIL PANEL
        ══════════════════════════════════════════════════════════════════ */}
        {selectedRoom && (
          <section ref={detailRef} className="scroll-mt-4">

            {/* Panel header */}
            <div className="bg-white rounded-t-2xl border border-slate-200 px-5 py-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-slate-900 text-white rounded-xl px-3 py-1.5 font-bold text-lg">
                  Zi. {selectedRoom}
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{selectedRoomName}</p>
                  <p className="text-xs text-slate-500">{selectedOrders.length} Bestellungen · offen</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {selectedTotal > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Checkout-Betrag</p>
                    <p className="text-xl font-black text-slate-900">€{selectedTotal.toFixed(2)}</p>
                  </div>
                )}
                <button onClick={() => { setSelectedRoom(null); setConfirmPayment(false) }}
                  className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Panel body */}
            <div className="bg-slate-50 rounded-b-2xl border border-t-0 border-slate-200 p-5 space-y-6">

              {selectedOrders.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <p className="text-3xl mb-2">🍽️</p>
                  <p className="text-sm">Noch keine offenen Bestellungen für dieses Zimmer.</p>
                </div>
              ) : (
                <>
                  {/* Active */}
                  {selectedActive.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Aktiv</h3>
                      {selectedActive.map(order => (
                        <OrderCard key={order.id} order={order} onStatusChange={updateStatus}
                          onDelete={() => setConfirmDelete(order.id)} isAdmin={isAdmin}
                          confirmingDelete={confirmDelete === order.id}
                          onConfirmDelete={() => deleteOrder(order.id)} onCancelDelete={() => setConfirmDelete(null)} />
                      ))}
                    </div>
                  )}

                  {/* Delivered */}
                  {selectedDelivered.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Geliefert</h3>
                      {selectedDelivered.map(order => (
                        <OrderCard key={order.id} order={order} onStatusChange={updateStatus}
                          onDelete={() => setConfirmDelete(order.id)} isAdmin={isAdmin}
                          confirmingDelete={confirmDelete === order.id}
                          onConfirmDelete={() => deleteOrder(order.id)} onCancelDelete={() => setConfirmDelete(null)} />
                      ))}
                    </div>
                  )}

                  {/* Cancelled */}
                  {selectedCancelled.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Storniert</h3>
                      {selectedCancelled.map(order => (
                        <OrderCard key={order.id} order={order} onStatusChange={updateStatus}
                          onDelete={() => setConfirmDelete(order.id)} isAdmin={isAdmin}
                          confirmingDelete={confirmDelete === order.id}
                          onConfirmDelete={() => deleteOrder(order.id)} onCancelDelete={() => setConfirmDelete(null)} />
                      ))}
                    </div>
                  )}

                  {/* Checkout summary + payment button */}
                  {canMarkPaid && (
                    <div className="bg-slate-900 rounded-2xl px-5 py-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Checkout-Betrag</p>
                          <p className="text-slate-300 text-xs mt-0.5">
                            {selectedDelivered.length + selectedActive.length} Bestellungen · ohne Stornierungen
                          </p>
                        </div>
                        <p className="text-3xl font-black text-white">€{selectedTotal.toFixed(2)}</p>
                      </div>

                      {/* Payment button */}
                      {confirmPayment ? (
                        <div className="bg-white/10 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                          <p className="text-white text-sm font-semibold">
                            💳 €{selectedTotal.toFixed(2)} als bezahlt markieren?
                          </p>
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={markPaymentReceived}
                              disabled={payingRoom}
                              className="rounded-xl bg-green-500 hover:bg-green-400 text-white px-4 py-2 text-sm font-bold disabled:opacity-60 transition-colors"
                            >
                              {payingRoom ? 'Wird gespeichert…' : '✓ Bestätigen'}
                            </button>
                            <button
                              onClick={() => setConfirmPayment(false)}
                              className="rounded-xl bg-white/20 hover:bg-white/30 text-white px-4 py-2 text-sm font-medium transition-colors"
                            >
                              Abbrechen
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmPayment(true)}
                          className="w-full bg-green-500 hover:bg-green-400 active:scale-[0.98] text-white rounded-xl py-3 text-sm font-bold transition-all"
                        >
                          💳 Zahlung erhalten
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            LIVE ACTIVE ORDERS
        ══════════════════════════════════════════════════════════════════ */}
        <section>
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
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Aktive Bestellungen — alle Zimmer</h2>
              {activeOrders.map(order => (
                <div key={order.id} className={cn(
                  'bg-white rounded-2xl shadow-sm border overflow-hidden transition-all',
                  order.status === 'new' ? 'border-blue-300 shadow-blue-100' : 'border-slate-200',
                )}>
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <button onClick={() => handleRoomClick(order.room_number)}
                        className="bg-slate-900 text-white rounded-xl px-3 py-1.5 font-bold text-lg hover:bg-slate-700 transition-colors" title="Zimmer öffnen">
                        Zi. {order.room_number}
                      </button>
                      <span className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                        STATUS_CONFIG[order.status].bg, STATUS_CONFIG[order.status].text)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_CONFIG[order.status].dot)} />
                        {STATUS_CONFIG[order.status].label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{timeAgo(order.created_at)}</span>
                      {isAdmin && (
                        confirmDelete === order.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-red-600 font-semibold">Löschen?</span>
                            <button onClick={() => deleteOrder(order.id)} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-bold text-white hover:bg-red-700">Ja</button>
                            <button onClick={() => setConfirmDelete(null)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600">Nein</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDelete(order.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                  <div className="px-5 py-3 space-y-1.5">
                    {order.order_items.map(item => (
                      <div key={item.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700"><span className="font-semibold text-slate-900">{item.quantity}×</span> {item.menu_item_name}</span>
                        <span className="text-slate-500">€{(item.price_at_order * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    {order.guest_notes && (
                      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">💬 {order.guest_notes}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-100">
                    <span className="font-bold text-slate-900">€{order.total_price?.toFixed(2) ?? '—'}</span>
                    <div className="flex gap-2">
                      {NEXT_STATUS[order.status] && (
                        <button onClick={() => updateStatus(order.id, NEXT_STATUS[order.status])}
                          className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-700 transition-colors">
                          {NEXT_LABEL[order.status]}
                        </button>
                      )}
                      <button onClick={() => updateStatus(order.id, 'cancelled')}
                        className="rounded-xl bg-slate-100 text-slate-500 px-4 py-2 text-sm font-medium hover:bg-red-50 hover:text-red-600 transition-colors">
                        Stornieren
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            ARCHIVE  — admin only, collapsible
        ══════════════════════════════════════════════════════════════════ */}
        {isAdmin && archiveEntries.length > 0 && (
          <section>
            {/* Archive header row */}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <button
                onClick={() => setShowArchive(v => !v)}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showArchive ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Archiv — bezahlte Bestellungen ({archiveEntries.length} Sitzungen)
              </button>

              {/* Delete entire archive */}
              {showArchive && (
                confirmDeleteAll ? (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-red-600 font-semibold">Gesamtes Archiv löschen?</span>
                    <button onClick={deleteAllArchive}
                      className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700 transition-colors">
                      Ja, alles löschen
                    </button>
                    <button onClick={() => setConfirmDeleteAll(false)}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteAll(true)}
                    className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Archiv leeren
                  </button>
                )
              )}
            </div>

            {showArchive && (
              <div className="space-y-3">
                {archiveEntries.map(([key, entry]) => {
                  const roomNumber  = key.split('::')[0]
                  const roomName    = rooms.find(r => r.room_number === roomNumber)?.name ?? ''
                  const paidDate    = format(new Date(entry.paidAt), 'dd. MMM yyyy · HH:mm', { locale: de })
                  const sessionIds  = entry.orders.map(o => o.id)
                  const isConfirming = confirmDeleteSession === key

                  return (
                    <div key={key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      {/* Session header */}
                      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100 flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-700 text-sm">Zi. {roomNumber}</span>
                          <span className="text-xs text-slate-400">{roomName}</span>
                          <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700">
                            💳 Bezahlt
                          </span>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-xs text-slate-400">{paidDate}</span>
                          <span className="text-xs font-bold text-slate-700">€{entry.total.toFixed(2)}</span>

                          {/* Delete session */}
                          {isConfirming ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-red-600 font-semibold">Sitzung löschen?</span>
                              <button onClick={() => deleteSession(sessionIds)}
                                className="rounded-lg bg-red-600 px-2 py-1 text-xs font-bold text-white hover:bg-red-700 transition-colors">
                                Ja
                              </button>
                              <button onClick={() => setConfirmDeleteSession(null)}
                                className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
                                Nein
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteSession(key)}
                              className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors"
                              title="Sitzung löschen"
                            >
                              <Trash2 className="w-3 h-3" />
                              Löschen
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Order rows */}
                      <div className="divide-y divide-slate-100">
                        {entry.orders.map(order => (
                          <div key={order.id} className="px-5 py-2.5 flex items-center justify-between opacity-60">
                            <div className="flex items-center gap-2 flex-wrap">
                              {order.order_items.map(item => (
                                <span key={item.id} className="text-xs text-slate-600">
                                  {item.quantity}× {item.menu_item_name}
                                </span>
                              ))}
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium',
                                STATUS_CONFIG[order.status].bg, STATUS_CONFIG[order.status].text)}>
                                {STATUS_CONFIG[order.status].label}
                              </span>
                              <span className="text-xs font-semibold text-slate-500">
                                €{order.total_price?.toFixed(2) ?? '—'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

      </div>
    </div>
  )
}
