'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X, Edit2, Save, Trash2, Phone, Mail, Users,
  Calendar, CreditCard, Utensils, Tag, Hash, AlertTriangle, Ban, Send, MapPin,
} from 'lucide-react'
import type {
  ReservationWithRoom, ReservationSource,
  PaymentMethod, PaymentStatus, ReservationStatus,
} from '@/types/database'
import {
  formatDateTime,
  buildCheckinTimestamp,
  buildCheckoutTimestamp,
  getSourceLabel,
  getSourceColor,
  getRoomFloor,
} from '@/lib/reservations'
import { useAdmin } from '@/hooks/useAdmin'
import { cn } from '@/lib/cn'
import DateInput from '@/components/ui/DateInput'
import TimeInput from '@/components/ui/TimeInput'

const STATUS_STYLES: Record<ReservationStatus, string> = {
  confirmed:   'bg-blue-100 text-blue-800',
  checked_in:  'bg-green-100 text-green-800',
  checked_out: 'bg-slate-100 text-slate-700',
  cancelled:   'bg-red-100 text-red-700',
  no_show:     'bg-orange-100 text-orange-700',
}

const STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed:   'Bestätigt',
  checked_in:  'Eingecheckt',
  checked_out: 'Ausgecheckt',
  cancelled:   'Storniert',
  no_show:     'Nicht erschienen',
}

const PAY_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid:         'Bezahlt',
  deposit_paid: 'Anzahlung',
  unpaid:       'Unbezahlt',
  refunded:     'Erstattet',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash:         'Bargeld',
  ec_card:      'EC-Karte',
  credit_card:  'Kreditkarte',
  online:       'Online',
  unpaid:       'Noch nicht bezahlt',
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
  const { isAdmin } = useAdmin()

  const [reservation,          setReservation]          = useState<ReservationWithRoom | null>(null)
  const [loading,              setLoading]              = useState(true)
  const [editing,              setEditing]              = useState(false)
  const [saving,               setSaving]               = useState(false)
  const [error,                setError]                = useState<string | null>(null)
  const [confirmDelete,        setConfirmDelete]        = useState(false)
  const [confirmPermDelete,    setConfirmPermDelete]    = useState(false)
  const [confirmCancel,        setConfirmCancel]        = useState(false)
  const [sendingEmail,         setSendingEmail]         = useState(false)
  const [emailSent,            setEmailSent]            = useState(false)
  const [emailError,           setEmailError]           = useState<string | null>(null)

  // Edit state
  const [editStatus,     setEditStatus]     = useState<ReservationStatus>('confirmed')
  const [editPayStatus,  setEditPayStatus]  = useState<PaymentStatus>('unpaid')
  const [editPayMethod,  setEditPayMethod]  = useState<PaymentMethod>('unpaid')
  const [editSource,     setEditSource]     = useState<ReservationSource>('phone')
  const [editBreakfast,  setEditBreakfast]  = useState(false)
  const [editNotes,         setEditNotes]         = useState('')
  const [editInternalNotes, setEditInternalNotes] = useState('')
  const [editTotalPrice, setEditTotalPrice] = useState('')
  const [editCheckin,      setEditCheckin]      = useState('')
  const [editCheckout,     setEditCheckout]     = useState('')
  const [editCheckinTime,  setEditCheckinTime]  = useState('12:00')
  const [editCheckoutTime, setEditCheckoutTime] = useState('13:00')
  const [editGuestCount, setEditGuestCount] = useState(1)
  const [editGuestName,      setEditGuestName]      = useState('')
  const [editGuestPhone,     setEditGuestPhone]     = useState('')
  const [editGuestEmail,     setEditGuestEmail]     = useState('')
  const [editBillingAddress, setEditBillingAddress] = useState('')

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
      setError('Reservierung konnte nicht geladen werden.')
    } else {
      const r = data as ReservationWithRoom
      setReservation(r)
      setEditStatus(r.status)
      setEditPayStatus(r.payment_status)
      setEditPayMethod(r.payment_method)
      setEditSource(r.source)
      setEditBreakfast(r.breakfast_included)
      setEditNotes(r.notes ?? '')
      setEditInternalNotes(r.internal_notes ?? '')
      setEditTotalPrice(r.total_price?.toString() ?? '')
      setEditCheckin(r.checkin_at.slice(0, 10))
      setEditCheckout(r.checkout_at.slice(0, 10))
      // Extract HH:MM from ISO timestamp to pre-fill time inputs
      const toHHMM = (iso: string) => {
        const d = new Date(iso)
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }
      setEditCheckinTime(toHHMM(r.checkin_at))
      setEditCheckoutTime(toHHMM(r.checkout_at))
      setEditGuestCount(r.guest_count)
      setEditGuestName(r.guest_name)
      setEditGuestPhone(r.guest_phone ?? '')
      setEditGuestEmail(r.guest_email ?? '')
      setEditBillingAddress((r as any).billing_address ?? '')
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!reservation) return
    setSaving(true)
    setError(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('update_reservation', {
      p_reservation_id: reservationId,
      p_guest_name:     editGuestName    || null,
      p_guest_phone:    editGuestPhone   || null,
      p_guest_email:    editGuestEmail   || null,
      p_guest_count:    editGuestCount,
      p_checkin_at:     buildCheckinTimestamp(editCheckin, editCheckinTime),
      p_checkout_at:    buildCheckoutTimestamp(editCheckout, editCheckoutTime),
      p_breakfast:      editBreakfast,
      p_source:         editSource,
      p_payment_method: editPayMethod,
      p_payment_status: editPayStatus,
      p_status:         editStatus,
      p_total_price:    editTotalPrice ? parseFloat(editTotalPrice) : null,
      p_notes:          editNotes      || null,
    })

    if (error) {
      let msg = 'Änderungen konnten nicht gespeichert werden.'
      if (error.message.includes('occupied')) msg = 'Dieses Zimmer ist für die gewählten Daten bereits belegt.'
      if (error.message.includes('capacity')) msg = 'Die Personenzahl überschreitet die Zimmerkapazität.'
      setError(msg)
      setSaving(false)
      return
    }

    // Save internal_notes + billing_address (not handled by RPC)
    await supabase.from('reservations')
      .update({
        internal_notes:  editInternalNotes  || null,
        billing_address: editBillingAddress || null,
      })
      .eq('id', reservationId)

    // Auto-set room to "needs cleaning" when guest checks out
    if (editStatus === 'checked_out' && reservation.status !== 'checked_out') {
      await supabase.from('rooms').update({
        cleaning_status:     'dirty',
        cleaning_updated_at: new Date().toISOString(),
      }).eq('id', reservation.room_id)
    }

    setEditing(false)
    setSaving(false)
    onUpdated()
    fetchReservation()
  }

  // ── Send confirmation email ───────────────────────────────────
  async function handleSendEmail() {
    if (!reservation?.guest_email) return
    setSendingEmail(true)
    setEmailError(null)
    setEmailSent(false)
    try {
      const res = await fetch('/api/send-confirmation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reservationId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Fehler')
      setEmailSent(true)
      setTimeout(() => setEmailSent(false), 4000)
    } catch (err: any) {
      setEmailError(err.message ?? 'E-Mail konnte nicht gesendet werden.')
    }
    setSendingEmail(false)
  }

  // ── Cancel reservation (status → cancelled) ──────────────────
  async function handleCancel() {
    if (!confirmCancel) { setConfirmCancel(true); return }
    setError(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('update_reservation', {
      p_reservation_id: reservationId,
      p_status:         'cancelled',
    })

    // If family booking, also cancel the linked reservation
    if (!error && reservation?.family_booking_id) {
      await supabase
        .from('reservations')
        .update({ status: 'cancelled' })
        .eq('family_booking_id', reservation.family_booking_id)
        .neq('id', reservationId)
    }

    if (error) { setError('Stornierung fehlgeschlagen.'); return }
    setConfirmCancel(false)
    onUpdated()
    fetchReservation()
  }

  // ── Soft delete (hides from employees, admin sees it still) ──
  async function handleSoftDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('reservations')
      .update({ deleted_at: now })
      .eq('id', reservationId)

    // Also soft-delete linked family reservation
    if (!error && reservation?.family_booking_id) {
      await supabase
        .from('reservations')
        .update({ deleted_at: now })
        .eq('family_booking_id', reservation.family_booking_id)
        .neq('id', reservationId)
    }

    if (error) { setError('Reservierung konnte nicht gelöscht werden.'); return }
    onUpdated()
    onClose()
  }

  // ── Permanent delete (admin only) ───────────────────────────
  async function handlePermanentDelete() {
    if (!confirmPermDelete) { setConfirmPermDelete(true); return }

    if (reservation?.family_booking_id) {
      await supabase
        .from('reservations')
        .delete()
        .eq('family_booking_id', reservation.family_booking_id)
    } else {
      await supabase.from('reservations').delete().eq('id', reservationId)
    }

    onUpdated()
    onClose()
  }

  if (loading) {
    return (
      <ModalShell onClose={onClose}>
        <div className="flex items-center justify-center h-40 text-slate-400">Wird geladen…</div>
      </ModalShell>
    )
  }

  if (!reservation) {
    return (
      <ModalShell onClose={onClose}>
        <div className="text-red-600 p-4">{error ?? 'Reservierung nicht gefunden.'}</div>
      </ModalShell>
    )
  }

  const r = reservation
  const isDeleted = !!r.deleted_at
  const isCancelled = r.status === 'cancelled' || r.status === 'no_show'
  const sourceColorClass = getSourceColor(r.source).replace('bg-', 'text-').replace('-500', '-600')

  return (
    <ModalShell onClose={onClose}>

      {/* Deleted banner (admin only) */}
      {isDeleted && (
        <div className="flex items-center gap-2 mx-5 mt-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">Diese Reservierung wurde gelöscht.</span>
          <span className="text-xs opacity-70 ml-1">({formatDateTime(r.deleted_at!)})</span>
        </div>
      )}

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
            <h2 className={cn('text-lg font-semibold truncate', isDeleted && 'line-through text-slate-400')}>
              {r.guest_name}
            </h2>
          )}

          <div className="flex items-center gap-2 mt-1">
            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
              STATUS_STYLES[r.status])}>
              {STATUS_LABELS[r.status]}
            </span>
            <span className={cn('text-xs font-medium', sourceColorClass)}>
              {getSourceLabel(r.source)}
            </span>
            {r.family_booking_id && (
              <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 font-medium">
                Familienzimmer
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
          {!editing && (
            <>
              {/* PDF / Print */}
              <a
                href={`/reservations/${reservationId}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                title="Buchungsbestätigung drucken / als PDF speichern"
              >
                🖨️ PDF
              </a>

              {/* Send email — only if guest has an email address */}
              {reservation?.guest_email && (
                <button
                  onClick={handleSendEmail}
                  disabled={sendingEmail}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    emailSent
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'border border-blue-300 text-blue-700 hover:bg-blue-50',
                    sendingEmail && 'opacity-50 cursor-wait',
                  )}
                  title={`Bestätigung senden an ${reservation.guest_email}`}
                >
                  <Send className="w-3.5 h-3.5" />
                  {emailSent ? '✓ Gesendet' : sendingEmail ? 'Sendet…' : 'E-Mail'}
                </button>
              )}
            </>
          )}
          {!editing && !isDeleted && (
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              <Edit2 className="w-3.5 h-3.5" />
              Bearbeiten
            </button>
          )}
          {editing && (
            <>
              <button onClick={() => { setEditing(false); setError(null) }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                Abbrechen
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Wird gespeichert…' : 'Speichern'}
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

      {/* Email error */}
      {emailError && (
        <div className="mx-5 mt-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-700 text-sm px-4 py-3 flex items-center justify-between">
          <span>{emailError}</span>
          <button onClick={() => setEmailError(null)} className="ml-2 text-orange-400 hover:text-orange-600">✕</button>
        </div>
      )}

      {/* Body */}
      <div className="p-5 space-y-5 overflow-y-auto max-h-[65vh] sm:max-h-[55vh]">

        {/* Room */}
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">
            {r.rooms.name}
            <span className="ml-2 font-normal text-slate-500">#{r.rooms.room_number}</span>
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{getRoomFloor(r.rooms.room_number)}</p>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <InfoField label="Anreise" icon={<Calendar className="w-3.5 h-3.5" />}>
            {editing ? (
              <div className="mt-1 flex gap-1.5">
                <DateInput value={editCheckin} onChange={setEditCheckin} className="flex-1 py-1" />
                <TimeInput value={editCheckinTime} onChange={setEditCheckinTime} className="w-24 py-1" />
              </div>
            ) : (
              <span className="text-sm text-slate-900">{formatDateTime(r.checkin_at)}</span>
            )}
          </InfoField>

          <InfoField label="Abreise" icon={<Calendar className="w-3.5 h-3.5" />}>
            {editing ? (
              <div className="mt-1 flex gap-1.5">
                <DateInput value={editCheckout} onChange={setEditCheckout} min={editCheckin} className="flex-1 py-1" />
                <TimeInput value={editCheckoutTime} onChange={setEditCheckoutTime} className="w-24 py-1" />
              </div>
            ) : (
              <span className="text-sm text-slate-900">{formatDateTime(r.checkout_at)}</span>
            )}
          </InfoField>
        </div>

        {/* Contact */}
        <div className="space-y-2">
          <InfoField label="Personen" icon={<Users className="w-3.5 h-3.5" />}>
            {editing ? (
              <input type="number" min={1} max={6} value={editGuestCount}
                onChange={e => setEditGuestCount(Number(e.target.value))}
                className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-20 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            ) : (
              <span className="text-sm text-slate-900">{r.guest_count} Person{r.guest_count !== 1 ? 'en' : ''}</span>
            )}
          </InfoField>

          {(r.guest_phone || editing) && (
            <InfoField label="Telefon" icon={<Phone className="w-3.5 h-3.5" />}>
              {editing ? (
                <input type="tel" value={editGuestPhone} onChange={e => setEditGuestPhone(e.target.value)}
                  className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500" />
              ) : (
                <a href={`tel:${r.guest_phone}`} className="text-sm text-blue-600 hover:underline">{r.guest_phone}</a>
              )}
            </InfoField>
          )}

          {(r.guest_email || editing) && (
            <InfoField label="E-Mail" icon={<Mail className="w-3.5 h-3.5" />}>
              {editing ? (
                <input type="email" value={editGuestEmail} onChange={e => setEditGuestEmail(e.target.value)}
                  className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500" />
              ) : (
                <a href={`mailto:${r.guest_email}`} className="text-sm text-blue-600 hover:underline">{r.guest_email}</a>
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
              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLES[r.status])}>
                {STATUS_LABELS[r.status]}
              </span>
            )}
          </InfoField>

          <InfoField label="Quelle" icon={<Tag className="w-3.5 h-3.5" />}>
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
          <InfoField label="Zahlungsmethode" icon={<CreditCard className="w-3.5 h-3.5" />}>
            {editing ? (
              <select value={editPayMethod} onChange={e => setEditPayMethod(e.target.value as PaymentMethod)}
                className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500">
                {(['cash','ec_card','credit_card','online','unpaid'] as PaymentMethod[]).map(m => (
                  <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m] ?? m}</option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-slate-900">{PAYMENT_METHOD_LABELS[r.payment_method] ?? r.payment_method}</span>
            )}
          </InfoField>

          <InfoField label="Zahlungsstatus" icon={<CreditCard className="w-3.5 h-3.5" />}>
            {editing ? (
              <select value={editPayStatus} onChange={e => setEditPayStatus(e.target.value as PaymentStatus)}
                className="mt-1 text-sm border border-slate-300 rounded px-2 py-1 w-full focus:outline-none focus:ring-1 focus:ring-blue-500">
                {(['paid','deposit_paid','unpaid','refunded'] as PaymentStatus[]).map(s => (
                  <option key={s} value={s}>{PAY_STATUS_LABELS[s]}</option>
                ))}
              </select>
            ) : (
              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', PAY_STATUS_STYLES[r.payment_status])}>
                {PAY_STATUS_LABELS[r.payment_status]}
              </span>
            )}
          </InfoField>
        </div>

        {/* Price & breakfast */}
        <div className="grid grid-cols-2 gap-4">
          <InfoField label="Gesamtpreis" icon={<CreditCard className="w-3.5 h-3.5" />}>
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

          <InfoField label="Frühstück" icon={<Utensils className="w-3.5 h-3.5" />}>
            {editing ? (
              <label className="flex items-center gap-2 mt-1 cursor-pointer">
                <input type="checkbox" checked={editBreakfast} onChange={e => setEditBreakfast(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm text-slate-700">Inklusive</span>
              </label>
            ) : (
              <span className="text-sm text-slate-900">
                {r.breakfast_included ? '✓ Inklusive' : 'Nicht inklusive'}
              </span>
            )}
          </InfoField>
        </div>

        {/* External ID */}
        {(r.external_id || editing) && (
          <InfoField label="Externe ID" icon={<Hash className="w-3.5 h-3.5" />}>
            <span className="text-sm text-slate-500 font-mono">{r.external_id ?? '—'}</span>
          </InfoField>
        )}

        {/* Billing address */}
        {((r as any).billing_address || editing) && (
          <InfoField label="Rechnungsadresse" icon={<MapPin className="w-3.5 h-3.5" />}>
            {editing ? (
              <textarea rows={2} value={editBillingAddress} onChange={e => setEditBillingAddress(e.target.value)}
                className="mt-1 text-sm border border-slate-300 rounded px-2 py-1.5 w-full resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Straße, PLZ Ort, Land…" />
            ) : (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{(r as any).billing_address || '—'}</p>
            )}
          </InfoField>
        )}

        {/* Notes (public – shown in email & PDF) */}
        <InfoField label="Notizen (E-Mail & PDF)" icon={<Edit2 className="w-3.5 h-3.5" />}>
          {editing ? (
            <textarea rows={3} value={editNotes} onChange={e => setEditNotes(e.target.value)}
              className="mt-1 text-sm border border-slate-300 rounded px-2 py-1.5 w-full resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Allergien, Sonderwünsche…" />
          ) : (
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.notes || '—'}</p>
          )}
        </InfoField>

        {/* Internal notes (never sent to guest) */}
        <InfoField label="Interne Notizen" icon={<Edit2 className="w-3.5 h-3.5" />}>
          {editing ? (
            <textarea rows={3} value={editInternalNotes} onChange={e => setEditInternalNotes(e.target.value)}
              className="mt-1 text-sm border border-amber-300 rounded px-2 py-1.5 w-full resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 bg-amber-50"
              placeholder="Interne Hinweise (nur intern sichtbar)…" />
          ) : (
            <p className="text-sm text-slate-700 whitespace-pre-wrap bg-amber-50 rounded px-2 py-1.5">{r.internal_notes || '—'}</p>
          )}
        </InfoField>

        {/* Meta */}
        <div className="text-2xs text-slate-400 space-y-0.5 pt-2 border-t border-slate-100">
          <p>Erstellt: {formatDateTime(r.created_at)}</p>
          <p>Aktualisiert: {formatDateTime(r.updated_at)}</p>
          <p>ID: {r.id}</p>
        </div>
      </div>

      {/* Footer: Cancel + Delete actions */}
      {!isDeleted && (
        <div className="px-5 pb-5 pt-3 border-t border-slate-100 space-y-2">

          {/* Cancel reservation */}
          {!isCancelled && (
            confirmCancel ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-amber-700 font-medium">Reservierung stornieren?</span>
                <button onClick={handleCancel}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600 transition-colors">
                  Ja, stornieren
                </button>
                <button onClick={() => setConfirmCancel(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                  Abbrechen
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmCancel(true)}
                className="flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-700 font-medium transition-colors">
                <Ban className="w-3.5 h-3.5" />
                Reservierung stornieren
              </button>
            )
          )}

          {/* Soft delete */}
          {confirmDelete ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-700 font-medium">Reservierung wirklich löschen?</span>
              <button onClick={handleSoftDelete}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors">
                Ja, löschen
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                Abbrechen
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
              Reservierung löschen
            </button>
          )}
        </div>
      )}

      {/* Admin: Permanent delete for already-deleted reservations */}
      {isDeleted && isAdmin && (
        <div className="px-5 pb-5 pt-3 border-t border-slate-100">
          {confirmPermDelete ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-700 font-medium">Endgültig und unwiderruflich löschen?</span>
              <button onClick={handlePermanentDelete}
                className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800 transition-colors">
                Ja, endgültig löschen
              </button>
              <button onClick={() => setConfirmPermDelete(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                Abbrechen
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmPermDelete(true)}
              className="flex items-center gap-1.5 text-sm text-red-700 hover:text-red-800 font-semibold transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
              Endgültig löschen (Admin)
            </button>
          )}
        </div>
      )}
    </ModalShell>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {children}
      </div>
    </div>
  )
}

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
