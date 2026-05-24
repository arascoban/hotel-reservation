'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAdmin } from '@/hooks/useAdmin'
import CountryInput from '@/components/ui/CountryInput'
import {
  Users, Search, Plus, X, Edit2, Trash2,
  Mail, Phone, MapPin, Calendar, ExternalLink,
  ChevronUp, ChevronDown, Building2, Globe,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  id: string
  name: string
  email: string | null
  phone: string | null
  street: string | null
  postcode: string | null
  city: string | null
  country: string | null
  notes: string | null
  source: string
  created_at: string
  updated_at: string
  // aggregated from reservations (join)
  stay_count?: number
  last_stay?: string | null
}

type SortField = 'name' | 'country' | 'last_stay' | 'stay_count' | 'created_at'
type SortDir   = 'asc' | 'desc'

const SOURCE_LABELS: Record<string, string> = {
  manual:      'Manuell',
  reservation: 'Reservierung',
  'booking.com': 'Booking.com',
}

const SOURCE_COLORS: Record<string, string> = {
  manual:        'bg-slate-100 text-slate-600',
  reservation:   'bg-blue-50 text-blue-700',
  'booking.com': 'bg-orange-50 text-orange-700',
}

// ── CustomerModal (create + edit) ────────────────────────────────────────────

interface ModalProps {
  customer?: Customer | null
  onClose: () => void
  onSaved: (c: Customer) => void
}

function CustomerModal({ customer, onClose, onSaved }: ModalProps) {
  const supabase = createClient()
  const isEdit = !!customer

  const [name,     setName]     = useState(customer?.name     ?? '')
  const [email,    setEmail]    = useState(customer?.email    ?? '')
  const [phone,    setPhone]    = useState(customer?.phone    ?? '')
  const [street,   setStreet]   = useState(customer?.street   ?? '')
  const [postcode, setPostcode] = useState(customer?.postcode ?? '')
  const [city,     setCity]     = useState(customer?.city     ?? '')
  const [country,  setCountry]  = useState(customer?.country  ?? '')
  const [notes,    setNotes]    = useState(customer?.notes    ?? '')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleSave() {
    if (!name.trim()) { setError('Name ist erforderlich.'); return }
    setSaving(true); setError(null)
    const payload = {
      name:     name.trim(),
      email:    email.trim()    || null,
      phone:    phone.trim()    || null,
      street:   street.trim()   || null,
      postcode: postcode.trim() || null,
      city:     city.trim()     || null,
      country:  country.trim()  || null,
      notes:    notes.trim()    || null,
    }
    if (isEdit && customer) {
      const { data, error: err } = await (supabase as any)
        .from('customers').update(payload).eq('id', customer.id)
        .select().single()
      if (err) { setError(err.message); setSaving(false); return }
      onSaved({ ...customer, ...(data as Customer) })
    } else {
      const { data, error: err } = await (supabase as any)
        .from('customers').insert({ ...payload, source: 'manual' })
        .select().single()
      if (err) { setError(err.message); setSaving(false); return }
      onSaved(data as Customer)
    }
  }

  const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs font-medium text-slate-500 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? 'Kunde bearbeiten' : 'Neuer Kunde'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className={labelCls}>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Vor- und Nachname" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>E-Mail</label>
              <input value={email} onChange={e => setEmail(e.target.value)} className={inputCls} type="email" placeholder="email@example.com" />
            </div>
            <div>
              <label className={labelCls}>Telefon</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} type="tel" placeholder="+49 …" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Straße & Hausnummer</label>
            <input value={street} onChange={e => setStreet(e.target.value)} className={inputCls} placeholder="Musterstraße 1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>PLZ</label>
              <input value={postcode} onChange={e => setPostcode(e.target.value)} className={inputCls} placeholder="12345" />
            </div>
            <div>
              <label className={labelCls}>Stadt</label>
              <input value={city} onChange={e => setCity(e.target.value)} className={inputCls} placeholder="Berlin" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Land</label>
            <CountryInput value={country} onChange={setCountry} />
          </div>
          <div>
            <label className={labelCls}>Notizen</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              className={`${inputCls} resize-none`} rows={3} placeholder="Interne Notizen zum Gast …" />
          </div>
        </div>
        <div className="flex gap-2 justify-end px-6 py-4 border-t border-slate-100">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Abbrechen
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50 transition-colors">
            {saving ? 'Speichern …' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({ customer, onClose, onDeleted }: { customer: Customer; onClose: () => void; onDeleted: (id: string) => void }) {
  const supabase = createClient()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await (supabase as any).from('customers').delete().eq('id', customer.id)
    onDeleted(customer.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Kunde löschen?</h2>
        <p className="text-sm text-slate-600 mb-6">
          <span className="font-medium">{customer.name}</span> wird dauerhaft gelöscht. Reservierungen bleiben erhalten.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            Abbrechen
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition-colors">
            {deleting ? 'Löschen …' : 'Löschen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detail Slide-Out ──────────────────────────────────────────────────────────

function CustomerDetail({ customer, reservations, onEdit, onClose }: {
  customer: Customer
  reservations: ReservationRow[]
  onEdit: () => void
  onClose: () => void
}) {
  const formatDate = (s: string) => new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-white shadow-2xl flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-800 truncate">{customer.name}</h2>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
            <Edit2 className="w-3.5 h-3.5" />
            Bearbeiten
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {/* Contact */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Kontakt</h3>
          <div className="space-y-2">
            {customer.email && (
              <a href={`mailto:${customer.email}`}
                className="flex items-center gap-3 text-sm text-slate-700 hover:text-blue-600 transition-colors">
                <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                {customer.email}
              </a>
            )}
            {customer.phone && (
              <a href={`tel:${customer.phone}`}
                className="flex items-center gap-3 text-sm text-slate-700 hover:text-blue-600 transition-colors">
                <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                {customer.phone}
              </a>
            )}
            {(customer.street || customer.city) && (
              <div className="flex items-start gap-3 text-sm text-slate-700">
                <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <div>
                  {customer.street && <div>{customer.street}</div>}
                  {(customer.postcode || customer.city) && (
                    <div>{[customer.postcode, customer.city].filter(Boolean).join(' ')}</div>
                  )}
                  {customer.country && <div>{customer.country}</div>}
                </div>
              </div>
            )}
            {!customer.email && !customer.phone && !customer.street && !customer.city && (
              <p className="text-sm text-slate-400 italic">Keine Kontaktdaten</p>
            )}
          </div>
        </section>

        {/* Notes */}
        {customer.notes && (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Notizen</h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{customer.notes}</p>
          </section>
        )}

        {/* Stats */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Aufenthalte</h3>
          {reservations.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Keine Reservierungen gefunden</p>
          ) : (
            <div className="space-y-2">
              {reservations.map(r => (
                <a key={r.id} href={`/reservations/${r.id}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:bg-slate-50 transition-colors group">
                  <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">Zimmer {r.room_number}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(r.checkin_at)} – {formatDate(r.checkout_at)}
                    </p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </a>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Quelle</h3>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[customer.source] ?? 'bg-slate-100 text-slate-600'}`}>
            {SOURCE_LABELS[customer.source] ?? customer.source}
          </span>
          <p className="text-xs text-slate-400 mt-1">Erstellt am {formatDate(customer.created_at)}</p>
        </section>
      </div>
    </div>
  )
}

// ── Reservation row type ──────────────────────────────────────────────────────

interface ReservationRow {
  id: string
  checkin_at: string
  checkout_at: string
  room_number: string
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const supabase = createClient()
  const { isAdmin } = useAdmin()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading,   setLoading]   = useState(true)
  const [query,     setQuery]     = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir,   setSortDir]   = useState<SortDir>('asc')
  const [countryFilter, setCountryFilter] = useState('')

  // Modals
  const [showCreate,    setShowCreate]    = useState(false)
  const [editCustomer,  setEditCustomer]  = useState<Customer | null>(null)
  const [deleteTarget,  setDeleteTarget]  = useState<Customer | null>(null)
  const [detailCustomer,setDetailCustomer] = useState<Customer | null>(null)
  const [detailReservations, setDetailReservations] = useState<ReservationRow[]>([])

  // ── Load customers with stay counts ──────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    // Fetch all customers
    const { data: custData } = await (supabase as any)
      .from('customers')
      .select('*')
      .order('name', { ascending: true })

    if (!custData) { setLoading(false); return }

    // Fetch reservation counts grouped by guest_name
    const { data: resCounts } = await supabase
      .from('reservations')
      .select('guest_name, checkin_at, checkout_at')
      .is('deleted_at', null)
      .neq('status', 'cancelled')

    // Build a map: lower(name) → { count, last_stay }
    const countMap = new Map<string, { count: number; last_stay: string }>()
    for (const r of ((resCounts ?? []) as any[])) {
      const key = (r.guest_name as string | null)?.toLowerCase().trim() ?? ''
      if (!key) continue
      const existing = countMap.get(key)
      if (!existing) {
        countMap.set(key, { count: 1, last_stay: r.checkin_at as string })
      } else {
        existing.count++
        if ((r.checkin_at as string) > existing.last_stay) existing.last_stay = r.checkin_at as string
      }
    }

    const enriched: Customer[] = (custData as any[]).map((c: any) => {
      const key = (c.name as string | null)?.toLowerCase().trim() ?? ''
      const stats = countMap.get(key)
      return { ...c, stay_count: stats?.count ?? 0, last_stay: stats?.last_stay ?? null } as Customer
    })
    setCustomers(enriched)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ── Load reservations for detail panel ───────────────────────────────────

  async function openDetail(c: Customer) {
    setDetailCustomer(c)
    const { data } = await supabase
      .from('reservations')
      .select('id, checkin_at, checkout_at, rooms(room_number)')
      .ilike('guest_name', c.name)
      .is('deleted_at', null)
      .neq('status', 'cancelled')
      .order('checkin_at', { ascending: false })
    const rows: ReservationRow[] = (data ?? []).map((r: any) => ({
      id:          r.id,
      checkin_at:  r.checkin_at,
      checkout_at: r.checkout_at,
      room_number: r.rooms?.room_number ?? '?',
    }))
    setDetailReservations(rows)
  }

  // ── Filtered + sorted list ────────────────────────────────────────────────

  const filtered = customers.filter(c => {
    const q = query.trim().toLowerCase()
    const matchQ = !q ||
      c.name.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q) ||
      (c.city  ?? '').toLowerCase().includes(q)
    const matchCountry = !countryFilter || (c.country ?? '').toLowerCase().includes(countryFilter.toLowerCase())
    return matchQ && matchCountry
  })

  const sorted = [...filtered].sort((a, b) => {
    let av: any, bv: any
    switch (sortField) {
      case 'name':       av = a.name ?? '';         bv = b.name ?? '';         break
      case 'country':    av = a.country ?? '';       bv = b.country ?? '';      break
      case 'last_stay':  av = a.last_stay ?? '';     bv = b.last_stay ?? '';    break
      case 'stay_count': av = a.stay_count ?? 0;     bv = b.stay_count ?? 0;    break
      case 'created_at': av = a.created_at ?? '';    bv = b.created_at ?? '';   break
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ?  1 : -1
    return 0
  })

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 text-slate-300" />
    return sortDir === 'asc'
      ? <ChevronUp   className="w-3 h-3 text-blue-500" />
      : <ChevronDown className="w-3 h-3 text-blue-500" />
  }

  const formatDate = (s: string | null | undefined) => s
    ? new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'

  // ── Callbacks ──────────────────────────────────────────────────────────────

  function handleSaved(c: Customer) {
    setCustomers(prev => {
      const idx = prev.findIndex(p => p.id === c.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = { ...prev[idx], ...c }; return next
      }
      return [c, ...prev]
    })
    setShowCreate(false)
    setEditCustomer(null)
    if (detailCustomer?.id === c.id) setDetailCustomer({ ...detailCustomer, ...c })
  }

  function handleDeleted(id: string) {
    setCustomers(prev => prev.filter(c => c.id !== id))
    setDeleteTarget(null)
    if (detailCustomer?.id === id) setDetailCustomer(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 flex-shrink-0">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Kunden</h1>
            <p className="text-sm text-slate-500">{customers.length} Gäste gesamt</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 active:scale-95 transition-all flex-shrink-0">
          <Plus className="w-4 h-4" />
          Neuer Kunde
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Name, E-Mail, Telefon, Stadt suchen …"
            className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="relative sm:w-52">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={countryFilter}
            onChange={e => setCountryFilter(e.target.value)}
            placeholder="Nach Land filtern …"
            className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mr-3" />
          Lädt …
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <Users className="w-10 h-10 mb-3 opacity-30" />
          <p className="font-medium">{query || countryFilter ? 'Keine Treffer gefunden' : 'Noch keine Kunden'}</p>
          {!query && !countryFilter && (
            <p className="text-sm mt-1">
              Erstellen Sie manuell einen Kunden oder führen Sie den SQL-Migrations-Backfill aus.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-3">
                    <button
                      onClick={() => toggleSort('name')}
                      className="flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                      Name <SortIcon field="name" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">
                    <span className="font-semibold text-slate-600">Kontakt</span>
                  </th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">
                    <button
                      onClick={() => toggleSort('country')}
                      className="flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                      Land <SortIcon field="country" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3">
                    <button
                      onClick={() => toggleSort('stay_count')}
                      className="flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                      Aufenthalte <SortIcon field="stay_count" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">
                    <button
                      onClick={() => toggleSort('last_stay')}
                      className="flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                      Letzter Aufenthalt <SortIcon field="last_stay" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">
                    <span className="font-semibold text-slate-600">Quelle</span>
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map(c => (
                  <tr key={c.id}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => openDetail(c)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{c.name}</div>
                      {c.city && (
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {[c.city, c.country].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="space-y-0.5">
                        {c.email && (
                          <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span className="truncate max-w-[180px]">{c.email}</span>
                          </div>
                        )}
                        {c.phone && (
                          <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {c.phone}
                          </div>
                        )}
                        {!c.email && !c.phone && (
                          <span className="text-xs text-slate-400 italic">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-600">
                      {c.country ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center justify-center min-w-[2rem] h-7 rounded-full text-xs font-semibold px-2 ${
                        (c.stay_count ?? 0) > 0
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-slate-100 text-slate-400'
                      }`}>
                        {c.stay_count ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-600 text-xs">
                      {formatDate(c.last_stay)}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[c.source] ?? 'bg-slate-100 text-slate-600'}`}>
                        {SOURCE_LABELS[c.source] ?? c.source}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end"
                        onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditCustomer(c) }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                          title="Bearbeiten">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => setDeleteTarget(c)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                            title="Löschen">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Footer count */}
          <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400 bg-slate-50">
            {sorted.length} von {customers.length} Kunden
          </div>
        </div>
      )}

      {/* Overlays */}
      {detailCustomer && (
        <>
          <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setDetailCustomer(null)} />
          <CustomerDetail
            customer={detailCustomer}
            reservations={detailReservations}
            onEdit={() => setEditCustomer(detailCustomer)}
            onClose={() => setDetailCustomer(null)}
          />
        </>
      )}

      {(showCreate || editCustomer) && (
        <CustomerModal
          customer={editCustomer}
          onClose={() => { setShowCreate(false); setEditCustomer(null) }}
          onSaved={handleSaved}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          customer={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
