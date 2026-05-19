'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X, Edit2, Save, Trash2, Phone, Mail, Users,
  Calendar, CreditCard, Utensils, Tag, Hash,
} from 'lucide-react'
import type {
  Reservation, ReservationWithRoom, ReservationSource,
  PaymentMethod, PaymentStatus, ReservationStatus,
} from '@/types/database'
import {
  formatReservationDate,
  buildCheckinTimestamp,
  buildCheckoutTimestamp,
  getSourceLabel,
  getSourceColor,
} from '@/lib/reservations'
import { cn } from '@/lib/cn'

const STATUS_STYLES: Record<ReservationStatus, string> = {
  confirmed:   'bg-blue-100 text-blue-800',
  checked_in:  'bg-green-100 text-green-800',
  checked_out: 'bg-slate-100 text-slate-700',
  cancelled:   'bg-red-100 text-red-700',
  no_show:     'bg-orange-100 text-orange-700',
}

const STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed:   'Confirmed',
  checked_in:  'Checked In',
  checked_out: 'Checked Out',
  cancelled:   'Cancelled',
  no_show:     'No Show',
}

const PAY_STATUS_STYLES: Record<PaymentStatus, string> = {
  paid:         'bg-green-100 text-green-800',
  deposit_paid: 'bg-yellow-100 text-yellow-800',
  unpaid:       'bg-red-100 text-red-700',
  refunded:     'bg-slate-100 text-slate-700',
}

interface Props {
  reservationId: string
  onClose: () => void
  onUpdated: () => void
}

export default function ReservationDetailModal({ reservationId, onClose, onUpdated }: Props) {
  const supabase = createClient()

  const [reservation, setReservation] = useState<ReservationWithRoom | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Edit form state
  const [editStatus,      setEditStatus]      = useState<ReservationStatus>('confirmed')
  const [editPayStatus,   setEditPayStatus]   = useState<PaymentStatus>('unpaid')
  const [editPayMethod,   setEditPayMethod]   = useState<PaymentMethod>('unpaid')
  const [editSource,      setEditSource]      = useState<ReservationSource>('phone')
  const [editBreakfast,   setEditBreakfast]   = useState(false)
  const [editNotes,       setEditNotes]       = useState('')
  const [editTotalPrice,  setEditTotalPrice]  = useState('')
  const [editCheckin,     setEditCheckin]     = useState('')
  const [editCheckout,    setEditCheckout]    = useState('')
  const [editGuestCount,  setEditGuestCount]  = useState(1)
  const [editGuestName,   setEditGuestName]   = useState('')
  const [editGuestPhone,  setEditGuestPhone]  = useState('')
  const [editGuestEmail,  setEditGuestEmail]  = useState('')

  useEffect(() => {
    fetchReservation()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationId])

  async function fetchReservation() {
    setLoading(true)
    const { data, error } = await supabase
      .from('reservations')
      .select('*, rooms(*, room_types(*))')
      .eq('id', reservationId)
      .single()

    if (error || !data) {
      setError('Could not load reservation.')
    } else {
      const r = data as ReservationWithRoom
      setReservation(r)
      // Populate edit fields
      setEditStatus(r.status)
      setEditPayStatus(r.payment_status)
      setEditPayMethod(r.payment_method)
      setEditSource(r.source)
      setEditBreakfast(r.breakfast_included)
      setEditNotes(r.notes ?? '')
      setEditTotalPrice(r.total_price?.toString() ?? '')
      setEditCheckin(r.checkin_at.slice(0, 10))
      setEditCheckout(r.checkout_at.slice(0, 10))
      setEditGuestCount(r.guest_count)
      setEditGuestName(r.guest_name)
      setEditGuestPhone(r.guest_phone ?? '')
      setEditGuestEmail(r.guest_email ?? '')
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!reservation) return
    setSaving(true)
    setError(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('update_reservation', {
      p_reservation_id: reservationId,
      p_guest_name:     editGuestName    || null,
      p_guest_phone:    editGuestPhone   || null,
      p_guest_email:    editGuestEmail   || null,
      p_guest_count:    editGuestCount,
      p_checkin_at:     buildCheckinTimestamp(editCheckin),
      p_checkout_at:    buildCheckoutTimestamp(editCheckout),
      p_breakfast:      editBreakfast,
      p_source:         editSource,
      p_payment_method: editPayMethod,
      p_payment_status: editPayStatus,
      p_status:         editStatus,
      p_total_price:    editTotalPrice ? parseFloat(editTotalPrice) : null,
      p_notes:          editNotes      || null,
    })

    if (error) {
      let msg = 'Failed to save changes.'
      if (error.message.includes('occupied')) msg = 'This room is already occupied for the selected dates.'
      if (error.message.includes('capacity')) msg = 'Guest count exceeds room capacity.'
      setError(msg)
      setSaving(false)
      return
    }

    setEditing(false)
    setSaving(false)
    onUpdated()
    fetchReservation()
  }

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    const { error } = await supabase
      .from('reservations')
      .delete()
      .eq('id', reservationId)
    if (error) {
      setError('Failed to delete reservation.')
      return
    }
    onUpdated()
    onClose()
  }

  if (loading) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex items-center justify-center h-40 text-slate-400">Loading…</div>
      </ModalShell>
    )
  }

  if (!reservation) {
    return (
      <ModalShell onClose={onClose}>
        <div className="text-red-600 p-4">{error ?? 'Reservation not found.'}</div>
      </ModalShell>
    )
  }

  const r = reservation
  const sourceColorClass = getSourceColor(r.source).replace('bg-', 'text-').replace('-500', '-600')

  return (
    <ModalShell onClose={onClose}>
      {/* Header */}
      <div className="flex items-start justify-between p-5 border-b border-slate-200">
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              type="text"
              value={editGuestName}
              onChange={e => setEditGuestName(e.target.value)}
              className="text-lg font-semibold text-slate-900 border-b border-slate-300 bg-transparent focus:outline-none focus:border-blue-500 w-full"
            />
          ) : (
            <h2 className="text-lg font-semibold text-slate-900 truncate">{r.guest_name}</h2>
          )}

          <div className="flex items-center gap-2 mt-1">
            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
              STATUS_STYLES[r.status])}>
              {STATUS_LABELS[r.status]}
            </span>
            <span className={cn('text-xs font-medium', sourceColorClass)}>
              {getSourceLabel(r.source)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          {!editing && (
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
          {editing && (
            <>
              <button onClick={() => { setEditing(false); setError(null) }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
          <button onClick={onClose}
            className="rounded-lg border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-5 mt-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* Body */}
      <div className="p-5 space-y-5 overflow-y-auto max-h-[60vh]">

        {/* Room info */}
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">
            {r.rooms.name}
            <span className="ml-2 font-normal text-slate-500">#{r.rooms.room_number}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{r.rooms.room_types.name}</p>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <InfoField label="Check-in" icon={<Calendar className="w-3.5 h-3.5" />}>
            {editing ? (
              <input type="date" value={editCheckin}
                onChange={e => setEditCheckin(e.target.value)}
                className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500" />
            ) : (
              <span className="text-sm text-slate-900">{formatReservationDate(r.checkin_at)}</span>
            )}
          </InfoField>

          <InfoField label="Check-out" icon={<Calendar className="w-3.5 h-3.5" />}>
            {editing ? (
              <input type="date" value={editCheckout} min={editCheckin}
                onChange={e => setEditCheckout(e.target.value)}
                className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500" />
            ) : (
              <span className="text-sm text-slate-900">{formatReservationDate(r.checkout_at)}</span>
            )}
          </InfoField>
        </div>

        {/* Contact */}
        <div className="space-y-2">
          <InfoField label="Guests" icon={<Users className="w-3.5 h-3.5" />}>
            {editing ? (
              <input type="number" min={1} max={4} value={editGuestCount}
                onChange={e => setEditGuestCount(Number(e.target.value))}
                className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-20 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            ) : (
              <span className="text-sm text-slate-900">{r.guest_count} guest{r.guest_count !== 1 ? 's' : ''}</span>
            )}
          </InfoField>

          {(r.guest_phone || editing) && (
            <InfoField label="Phone" icon={<Phone className="w-3.5 h-3.5" />}>
              {editing ? (
                <input type="tel" value={editGuestPhone}
                  onChange={e => setEditGuestPhone(e.target.value)}
                  className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500" />
              ) : (
                <a href={`tel:${r.guest_phone}`} className="text-sm text-blue-600 hover:underline">
                  {r.guest_phone}
                </a>
              )}
            </InfoField>
          )}

          {(r.guest_email || editing) && (
            <InfoField label="Email" icon={<Mail className="w-3.5 h-3.5" />}>
              {editing ? (
                <input type="email" value={editGuestEmail}
                  onChange={e => setEditGuestEmail(e.target.value)}
                  className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500" />
              ) : (
                <a href={`mailto:${r.guest_email}`} className="text-sm text-blue-600 hover:underline">
                  {r.guest_email}
                </a>
              )}
            </InfoField>
          )}
        </div>

        {/* Status & source */}
        <div className="grid grid-cols-2 gap-4">
          <InfoField label="Status" icon={<Tag className="w-3.5 h-3.5" />}>
            {editing ? (
              <select value={editStatus} onChange={e => setEditStatus(e.target.value as ReservationStatus)}
                className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500">
                {(['confirmed','checked_in','checked_out','cancelled','no_show'] as ReservationStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            ) : (
              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                STATUS_STYLES[r.status])}>
                {STATUS_LABELS[r.status]}
              </span>
            )}
          </InfoField>

          <InfoField label="Source" icon={<Tag className="w-3.5 h-3.5" />}>
            {editing ? (
              <select value={editSource} onChange={e => setEditSource(e.target.value as ReservationSource)}
                className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500">
                {(['booking_com','expedia','airbnb','walk_in','phone','website','other'] as ReservationSource[]).map(s => (
                  <option key={s} value={s}>{getSourceLabel(s)}</option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-slate-900">{getSourceLabel(r.source)}</span>
            )}
          </InfoField>
        </div>

        {/* Payment */}
        <div className="grid grid-cols-2 gap-4">
          <InfoField label="Payment Method" icon={<CreditCard className="w-3.5 h-3.5" />}>
            {editing ? (
              <select value={editPayMethod} onChange={e => setEditPayMethod(e.target.value as PaymentMethod)}
                className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500">
                {(['cash','ec_card','credit_card','online','unpaid'] as PaymentMethod[]).map(m => (
                  <option key={m} value={m}>{m.replace('_', ' ')}</option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-slate-900 capitalize">{r.payment_method.replace('_', ' ')}</span>
            )}
          </InfoField>

          <InfoField label="Payment Status" icon={<CreditCard className="w-3.5 h-3.5" />}>
            {editing ? (
              <select value={editPayStatus} onChange={e => setEditPayStatus(e.target.value as PaymentStatus)}
                className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500">
                {(['paid','deposit_paid','unpaid','refunded'] as PaymentStatus[]).map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            ) : (
              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                PAY_STATUS_STYLES[r.payment_status])}>
                {r.payment_status.replace('_', ' ')}
              </span>
            )}
          </InfoField>
        </div>

        {/* Price & breakfast */}
        <div className="grid grid-cols-2 gap-4">
          <InfoField label="Total Price" icon={<CreditCard className="w-3.5 h-3.5" />}>
            {editing ? (
              <input type="number" min={0} step={0.01} value={editTotalPrice}
                onChange={e => setEditTotalPrice(e.target.value)}
                className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="0.00" />
            ) : (
              <span className="text-sm text-slate-900">
                {r.total_price != null ? `€${r.total_price.toFixed(2)}` : '—'}
              </span>
            )}
          </InfoField>

          <InfoField label="Breakfast" icon={<Utensils className="w-3.5 h-3.5" />}>
            {editing ? (
              <label className="flex items-center gap-2 mt-1 cursor-pointer">
                <input type="checkbox" checked={editBreakfast}
                  onChange={e => setEditBreakfast(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-slate-700">Included</span>
              </label>
            ) : (
              <span className="text-sm text-slate-900">
                {r.breakfast_included ? '✓ Included' : 'Not included'}
              </span>
            )}
          </InfoField>
        </div>

        {/* External ID */}
        {(r.external_id || editing) && (
          <InfoField label="External ID" icon={<Hash className="w-3.5 h-3.5" />}>
            <span className="text-sm text-slate-500 font-mono">{r.external_id ?? '—'}</span>
          </InfoField>
        )}

        {/* Notes */}
        <InfoField label="Notes" icon={<Edit2 className="w-3.5 h-3.5" />}>
          {editing ? (
            <textarea rows={3} value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              className="mt-1 text-sm border border-slate-300 rounded px-2 py-1.5 w-full resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Notes…" />
          ) : (
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.notes || '—'}</p>
          )}
        </InfoField>

        {/* Meta */}
        <div className="text-2xs text-slate-400 space-y-0.5 pt-2 border-t border-slate-100">
          <p>Created: {new Date(r.created_at).toLocaleString()}</p>
          <p>Updated: {new Date(r.updated_at).toLocaleString()}</p>
          <p>ID: {r.id}</p>
        </div>
      </div>

      {/* Delete */}
      <div className="px-5 pb-5 pt-3 border-t border-slate-100">
        {confirmDelete ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-red-700 font-medium">Delete this reservation?</span>
            <button onClick={handleDelete}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors">
              Yes, delete
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
            Delete reservation
          </button>
        )}
      </div>
    </ModalShell>
  )
}

// ─── Modal shell ─────────────────────────────────────────────────────────────

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {children}
      </div>
    </div>
  )
}

// ─── Helper component ─────────────────────────────────────────────────────────

function InfoField({ label, icon, children }: {
  label: string; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-slate-400 mb-0.5">
        {icon}
        <span className="text-2xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      {children}
    </div>
  )
}
