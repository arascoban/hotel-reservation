'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, X } from 'lucide-react'
import type {
  ReservationWithRoom, ReservationStatus, PaymentStatus, ReservationSource,
} from '@/types/database'
import ReservationTable from '@/components/Reservations/ReservationTable'
import { cn } from '@/lib/cn'

const STATUSES: { value: ReservationStatus | ''; label: string }[] = [
  { value: '',            label: 'Alle Status' },
  { value: 'confirmed',   label: 'Bestätigt' },
  { value: 'checked_in',  label: 'Eingecheckt' },
  { value: 'checked_out', label: 'Ausgecheckt' },
  { value: 'cancelled',   label: 'Storniert' },
  { value: 'no_show',     label: 'Nicht erschienen' },
]

const PAY_STATUSES: { value: PaymentStatus | ''; label: string }[] = [
  { value: '',             label: 'Alle Zahlungen' },
  { value: 'paid',         label: 'Bezahlt' },
  { value: 'deposit_paid', label: 'Anzahlung' },
  { value: 'unpaid',       label: 'Unbezahlt' },
  { value: 'refunded',     label: 'Erstattet' },
]

const SOURCES: { value: ReservationSource | ''; label: string }[] = [
  { value: '',            label: 'Alle Quellen' },
  { value: 'booking_com', label: 'Booking.com' },
  { value: 'expedia',     label: 'Expedia' },
  { value: 'airbnb',      label: 'Airbnb' },
  { value: 'walk_in',     label: 'Laufkundschaft' },
  { value: 'phone',       label: 'Telefon' },
  { value: 'website',     label: 'Website' },
  { value: 'other',       label: 'Sonstige' },
]

const selectClass = 'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'

export default function SearchPage() {
  const supabase = createClient()

  const [query,      setQuery]      = useState('')
  const [status,     setStatus]     = useState<ReservationStatus | ''>('')
  const [payStatus,  setPayStatus]  = useState<PaymentStatus | ''>('')
  const [source,     setSource]     = useState<ReservationSource | ''>('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')

  const [results,    setResults]    = useState<ReservationWithRoom[]>([])
  const [searching,  setSearching]  = useState(false)
  const [searched,   setSearched]   = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const runSearch = useCallback(async () => {
    setSearching(true)
    setError(null)
    setSearched(true)

    let q = supabase
      .from('reservations')
      .select('*, rooms(*, room_types(*))')
      .order('checkin_at', { ascending: false })
      .limit(200)

    if (status)    q = q.eq('status', status)
    if (payStatus) q = q.eq('payment_status', payStatus)
    if (source)    q = q.eq('source', source)
    if (dateFrom)  q = q.gte('checkin_at', `${dateFrom}T00:00:00`)
    if (dateTo)    q = q.lte('checkout_at', `${dateTo}T23:59:59`)

    const { data, error: err } = await q

    if (err) {
      setError('Search failed. Please try again.')
      setResults([])
    } else {
      let filtered = (data ?? []) as ReservationWithRoom[]

      // Text search on guest fields (done client-side after fetch)
      if (query.trim()) {
        const q = query.trim().toLowerCase()
        filtered = filtered.filter(r =>
          r.guest_name.toLowerCase().includes(q)  ||
          r.guest_email?.toLowerCase().includes(q) ||
          r.guest_phone?.toLowerCase().includes(q) ||
          r.rooms.name.toLowerCase().includes(q)   ||
          r.rooms.room_number.toLowerCase().includes(q) ||
          r.external_id?.toLowerCase().includes(q),
        )
      }

      setResults(filtered)
    }

    setSearching(false)
  }, [supabase, query, status, payStatus, source, dateFrom, dateTo])

  function handleReset() {
    setQuery('')
    setStatus('')
    setPayStatus('')
    setSource('')
    setDateFrom('')
    setDateTo('')
    setResults([])
    setSearched(false)
    setError(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') runSearch()
  }

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Reservierungen suchen</h1>
        <p className="text-slate-500 mt-1">
          Nach Gast, Datum, Quelle, Status oder Zahlung filtern.
        </p>
      </div>

      {/* Search panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6 space-y-4">
        {/* Text search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Suche nach Name, E-Mail, Telefon, Zimmer, externe ID…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-lg border border-slate-300 pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select value={status} onChange={e => setStatus(e.target.value as ReservationStatus | '')}
            className={selectClass}>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <select value={payStatus} onChange={e => setPayStatus(e.target.value as PaymentStatus | '')}
            className={selectClass}>
            {PAY_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <select value={source} onChange={e => setSource(e.target.value as ReservationSource | '')}
            className={selectClass}>
            {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600 whitespace-nowrap">Anreise ab</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className={cn(selectClass, 'cursor-pointer')} />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600 whitespace-nowrap">bis</label>
            <input type="date" value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)}
              className={cn(selectClass, 'cursor-pointer')} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={runSearch}
            disabled={searching}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {searching ? 'Suche läuft…' : 'Suchen'}
          </button>

          {searched && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Zurücksetzen
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {/* Results */}
      {searched && !searching && (
        <div>
          <p className="text-sm text-slate-500 mb-3">
            {results.length} Ergebnis{results.length !== 1 ? 'se' : ''} gefunden.
          </p>
          <ReservationTable reservations={results} onRefresh={runSearch} />
        </div>
      )}

      {!searched && (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <Search className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            Suchbegriff eingeben oder Filter wählen, dann <strong>Suchen</strong> klicken.
          </p>
        </div>
      )}
    </div>
  )
}
