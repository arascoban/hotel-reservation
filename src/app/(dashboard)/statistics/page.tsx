'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, subDays, subMonths, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

type Range = 'daily' | 'weekly' | 'monthly'

const TOTAL_ROOMS = 22 // adjust to your actual room count

export default function StatisticsPage() {
  const supabase = createClient()
  const [range,   setRange]   = useState<Range>('daily')
  const [loading, setLoading] = useState(true)
  const [occ,     setOcc]     = useState<{ label: string; rate: number }[]>([])
  const [rev,     setRev]     = useState<{ label: string; revenue: number }[]>([])
  const [totals,  setTotals]  = useState({ reservations: 0, revenue: 0, avgOcc: 0 })

  useEffect(() => { load(range) }, [range])   // eslint-disable-line react-hooks/exhaustive-deps

  async function load(r: Range) {
    setLoading(true)
    const now = new Date()
    let from: Date, to: Date

    if (r === 'daily')   { from = subDays(now, 29);   to = now }
    else if (r === 'weekly') { from = subDays(now, 7 * 11); to = now }
    else                 { from = subMonths(now, 11);  to = now }

    const { data } = await supabase
      .from('reservations')
      .select('checkin_at, checkout_at, total_price, status')
      .not('status', 'in', '("cancelled","no_show")')
      .is('deleted_at', null)
      .gte('checkout_at', from.toISOString())
      .lte('checkin_at',  to.toISOString())

    const rows = data ?? []

    // Build occupancy + revenue per bucket
    let buckets: { label: string; from: Date; to: Date }[] = []

    if (r === 'daily') {
      buckets = eachDayOfInterval({ start: from, end: now }).map(d => ({
        label: format(d, 'd. MMM', { locale: de }),
        from:  startOfDay(d),
        to:    endOfDay(d),
      }))
    } else if (r === 'weekly') {
      buckets = eachWeekOfInterval({ start: from, end: now }, { weekStartsOn: 1 }).map(d => ({
        label: `KW ${format(d, 'w')}`,
        from:  startOfWeek(d, { weekStartsOn: 1 }),
        to:    endOfWeek(d,   { weekStartsOn: 1 }),
      }))
    } else {
      buckets = eachMonthOfInterval({ start: from, end: now }).map(d => ({
        label: format(d, 'MMM yy', { locale: de }),
        from:  startOfMonth(d),
        to:    endOfMonth(d),
      }))
    }

    const occData = buckets.map(b => {
      const days = Math.max(1, Math.round((b.to.getTime() - b.from.getTime()) / 86400000))
      const roomNights = rows.filter(res => {
        const ci = new Date(res.checkin_at)
        const co = new Date(res.checkout_at)
        return ci < b.to && co > b.from
      }).reduce((sum, res) => {
        const ci  = new Date(res.checkin_at)
        const co  = new Date(res.checkout_at)
        const s   = Math.max(ci.getTime(), b.from.getTime())
        const e   = Math.min(co.getTime(), b.to.getTime())
        return sum + Math.max(0, (e - s) / 86400000)
      }, 0)
      const rate = Math.min(100, Math.round((roomNights / (TOTAL_ROOMS * days)) * 100))
      return { label: b.label, rate }
    })

    const revData = buckets.map(b => {
      const revenue = rows
        .filter(res => {
          const ci = new Date(res.checkin_at)
          return ci >= b.from && ci <= b.to
        })
        .reduce((sum, res) => sum + (res.total_price ?? 0), 0)
      return { label: b.label, revenue: Math.round(revenue * 100) / 100 }
    })

    const totalRev = rows.reduce((s, r) => s + (r.total_price ?? 0), 0)
    const avgOcc   = occData.length ? Math.round(occData.reduce((s, d) => s + d.rate, 0) / occData.length) : 0

    setOcc(occData)
    setRev(revData)
    setTotals({ reservations: rows.length, revenue: totalRev, avgOcc })
    setLoading(false)
  }

  const RANGE_LABELS: Record<Range, string> = { daily: 'Täglich (30 Tage)', weekly: 'Wöchentlich (12 Wochen)', monthly: 'Monatlich (12 Monate)' }

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Statistiken</h1>
          <p className="text-slate-500 mt-1">Auslastung und Umsatz im Überblick</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
          {(['daily', 'weekly', 'monthly'] as Range[]).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${range === r ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {RANGE_LABELS[r].split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reservierungen</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{totals.reservations}</p>
          <p className="text-xs text-slate-400 mt-1">im gewählten Zeitraum</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Umsatz gesamt</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">€{totals.revenue.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-xs text-slate-400 mt-1">im gewählten Zeitraum</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ø Auslastung</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{totals.avgOcc}%</p>
          <p className="text-xs text-slate-400 mt-1">Durchschnitt ({TOTAL_ROOMS} Zimmer)</p>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-slate-400 text-sm">Lädt…</div>
      ) : (
        <>
          {/* Occupancy chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Auslastungsrate (%)</h2>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={occ} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => [`${v}%`, 'Auslastung']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Area type="monotone" dataKey="rate" stroke="#3b82f6" strokeWidth={2} fill="url(#occGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Revenue chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Umsatz (€)</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={rev} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `€${v}`} />
                <Tooltip formatter={(v: number) => [`€${v.toFixed(2)}`, 'Umsatz']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
