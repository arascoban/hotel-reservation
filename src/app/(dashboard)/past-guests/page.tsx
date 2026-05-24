'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, subDays } from 'date-fns'
import { de } from 'date-fns/locale'
import { History, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface PastGuest {
  id: string
  guest_name: string
  guest_email: string | null
  guest_phone: string | null
  guest_count: number
  checkin_at: string
  checkout_at: string
  total_price: number | null
  payment_status: string
  source: string
  breakfast_included: boolean
  rooms: { room_number: string; name: string }
}

const PAGE_SIZE = 30

export default function PastGuestsPage() {
  const supabase = createClient()
  const [guests,   setGuests]   = useState<PastGuest[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [page,     setPage]     = useState(0)
  const [total,    setTotal]    = useState(0)

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true)
    const now = new Date().toISOString()
    const from = p * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let query = supabase
      .from('reservations')
      .select('id, guest_name, guest_email, guest_phone, guest_count, checkin_at, checkout_at, total_price, payment_status, source, breakfast_included, rooms(room_number, name)', { count: 'exact' })
      .not('status', 'in', '("cancelled","no_show")')
      .is('deleted_at', null)
      .or(`status.eq.checked_out,checkout_at.lt.${now}`)
      .order('checkout_at', { ascending: false })
      .range(from, to)

    if (q.trim()) {
      query = query.ilike('guest_name', `%${q.trim()}%`)
    }

    const { data, count } = await query
    setGuests((data ?? []) as unknown as PastGuest[])
    setTotal(count ?? 0)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load(search, 0); setPage(0) }, [search])  // eslint-disable-line
  useEffect(() => { load(search, page) }, [page])             // eslint-disable-line

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const STATUS_BADGE: Record<string, string> = {
    paid:    'bg-green-100 text-green-700',
    unpaid:  'bg-amber-100 text-amber-700',
    refunded:'bg-slate-100 text-slate-600',
  }

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-8 max-w-6xl mx-auto">
      <div className="mb-5 sm:mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <History className="w-6 h-6 text-slate-500" />
            Vergangene Gäste
          </h1>
          <p className="text-slate-500 mt-1">{total} abgereiste Gäste</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Gästename suchen…"
            className="pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-60"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400 text-sm">Lädt…</div>
      ) : guests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-16 text-center">
          <History className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Keine vergangenen Gäste gefunden.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Zimmer</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Gast</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-600">Pers.</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Anreise</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Abreise</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Preis</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Zahlung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {guests.map(g => (
                <tr key={g.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-bold text-slate-900">Zi. {g.rooms.room_number}</span>
                    <span className="ml-1.5 text-xs text-slate-400 hidden sm:inline">{g.rooms.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{g.guest_name}</div>
                    {g.guest_email && <div className="text-xs text-slate-400">{g.guest_email}</div>}
                    {g.guest_phone && !g.guest_email && <div className="text-xs text-slate-400">{g.guest_phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600">{g.guest_count}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {format(new Date(g.checkin_at), 'd. MMM yyyy', { locale: de })}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    {format(new Date(g.checkout_at), 'd. MMM yyyy', { locale: de })}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">
                    {g.total_price != null ? `€${g.total_price.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                      STATUS_BADGE[g.payment_status] ?? 'bg-slate-100 text-slate-500')}>
                      {g.payment_status === 'paid' ? 'Bezahlt' : g.payment_status === 'unpaid' ? 'Offen' : g.payment_status}
                    </span>
                    {g.breakfast_included && (
                      <span className="ml-1 text-amber-500 text-xs" title="Mit Frühstück">☕</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
              <span className="text-xs text-slate-500">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} von {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                  className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-600 font-medium">{page + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                  className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
