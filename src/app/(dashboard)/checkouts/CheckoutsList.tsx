'use client'

import { useState, useMemo } from 'react'
import { createClient }      from '@/lib/supabase/client'
import { useAdmin }          from '@/hooks/useAdmin'
import type { ReservationWithRoom } from '@/types/database'
import { LogOut, Undo2, FileText, X, AlertTriangle } from 'lucide-react'
import { cn }                from '@/lib/cn'
import { format, startOfDay, subDays, addDays, differenceInCalendarDays } from 'date-fns'
import { de }                from 'date-fns/locale'

// ─── Constants ────────────────────────────────────────────────────────────────

type ModalStep = 'payment' | 'details'

const PAY_METHODS = [
  { value: 'cash',        label: 'Bargeld'     },
  { value: 'ec_card',     label: 'EC-Karte'    },
  { value: 'credit_card', label: 'Kreditkarte' },
  { value: 'online',      label: 'Online'      },
]

const PAY_LABELS: Record<string, string> = {
  cash: 'Bargeld', ec_card: 'EC-Karte', credit_card: 'Kreditkarte', online: 'Online',
}

function fmtNum(n: number) { return String(n).padStart(6, '0') }

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  initialReservations: ReservationWithRoom[]
  today: string   // 'yyyy-MM-dd'
}

export default function CheckoutsList({ initialReservations, today }: Props) {
  const supabase    = createClient()
  const { isAdmin } = useAdmin()

  const [reservations, setReservations] = useState<ReservationWithRoom[]>(initialReservations)
  const [globalError,  setGlobalError]  = useState<string | null>(null)

  // ── modal ──────────────────────────────────────────────────────────────────
  const [pending,          setPending]          = useState<ReservationWithRoom | null>(null)
  const [step,             setStep]             = useState<ModalStep>('payment')
  const [hasPaid,          setHasPaid]          = useState(true)
  const [payMethod,        setPayMethod]        = useState('cash')
  const [earlyDeparture,   setEarlyDeparture]   = useState(false)
  const [actualNights,     setActualNights]     = useState(1)
  const [actualPrice,      setActualPrice]      = useState('')
  const [wantInvoice,      setWantInvoice]      = useState(false)
  const [processing,       setProcessing]       = useState(false)
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null)

  // ── admin un-checkout ─────────────────────────────────────────────────────
  const [undoing, setUndoing] = useState<string | null>(null)

  // ── date helpers ──────────────────────────────────────────────────────────
  const tomorrow   = format(addDays(new Date(), 1), 'yyyy-MM-dd')
  const overmorrow = format(addDays(new Date(), 2), 'yyyy-MM-dd')
  const threeDaysAgo = startOfDay(subDays(new Date(), 2))

  // Pending = not yet checked out, split into today / tomorrow / day after
  const todayRows      = useMemo(() => reservations.filter(r =>
    r.status !== 'checked_out' && r.checkout_at.slice(0, 10) === today), [reservations, today])
  const tomorrowRows   = useMemo(() => reservations.filter(r =>
    r.status !== 'checked_out' && r.checkout_at.slice(0, 10) === tomorrow), [reservations, tomorrow])
  const overmorrowRows = useMemo(() => reservations.filter(r =>
    r.status !== 'checked_out' && r.checkout_at.slice(0, 10) === overmorrow), [reservations, overmorrow])

  const departed = useMemo(() => {
    const all = reservations.filter(r => r.status === 'checked_out')
    return isAdmin ? all : all.filter(r => new Date(r.checkout_at) >= threeDaysAgo)
  }, [reservations, isAdmin, threeDaysAgo])

  const archive = useMemo(() =>
    isAdmin
      ? reservations.filter(r => r.status === 'checked_out' && new Date(r.checkout_at) < threeDaysAgo)
      : [],
  [reservations, isAdmin, threeDaysAgo])

  // ── open / close modal ────────────────────────────────────────────────────
  function openModal(r: ReservationWithRoom) {
    const plannedNights = Math.max(1, differenceInCalendarDays(
      new Date(r.checkout_at), new Date(r.checkin_at),
    ))
    setPending(r)
    setStep('payment')
    setHasPaid(true)
    setPayMethod('cash')
    setEarlyDeparture(false)
    setActualNights(plannedNights)
    setActualPrice(r.total_price != null ? String(r.total_price) : '')
    setWantInvoice(false)
    setCreatedInvoiceId(null)
    setGlobalError(null)
  }

  function closeModal() { if (!processing) { setPending(null); setCreatedInvoiceId(null) } }

  // ── perform checkout ──────────────────────────────────────────────────────
  async function doCheckout() {
    if (!pending) return
    setProcessing(true)
    const now = new Date().toISOString()

    const plannedNights = Math.max(1, differenceInCalendarDays(
      new Date(pending.checkout_at), new Date(pending.checkin_at),
    ))
    const finalPrice  = earlyDeparture && actualPrice !== ''
      ? parseFloat(actualPrice)
      : (pending.total_price ?? 0)
    const finalNights = earlyDeparture ? actualNights : plannedNights

    // ── 1. Invoice (if requested) ─────────────────────────────────────────
    let invoiceId: string | null = null
    if (wantInvoice) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: numData, error: numErr } = await (supabase as any).rpc('get_next_invoice_number')
      if (numErr) { setGlobalError('Rechnungsnummer konnte nicht generiert werden.'); setProcessing(false); return }

      const { data: resExtra } = await supabase
        .from('reservations')
        .select('billing_address, guest_street, guest_postcode, guest_city, guest_country, notes')
        .eq('id', pending.id).single()

      // Build formatted address from structured fields (fallback to legacy billing_address)
      const rx = resExtra as any
      const addrParts = [
        rx?.guest_street,
        [rx?.guest_postcode, rx?.guest_city].filter(Boolean).join(' '),
        rx?.guest_country,
      ].filter(Boolean)
      const guestAddress = addrParts.length > 0
        ? addrParts.join('\n')
        : (rx?.billing_address ?? null)

      const invoicePayload: Record<string, unknown> = {
        invoice_number:     numData as number,
        reservation_id:     pending.id,
        guest_name:         pending.guest_name,
        guest_email:        pending.guest_email ?? null,
        guest_address:      guestAddress,
        room_number:        pending.rooms.room_number,
        room_name:          pending.rooms.name,
        checkin_at:         pending.checkin_at,
        checkout_at:        pending.checkout_at,
        nights:             finalNights,
        total_price:        finalPrice,
        payment_method:     payMethod,
        breakfast_included: pending.breakfast_included,
        notes:              (resExtra as any)?.notes ?? null,
        created_by:         (await supabase.auth.getUser()).data.user?.email ?? null,
        created_at:         now,
      }

      // Only include early-departure columns when actually used
      // (safe even if migration 015 hasn't been applied yet)
      if (earlyDeparture) {
        invoicePayload.early_departure = true
        invoicePayload.original_nights = plannedNights
        invoicePayload.original_price  = pending.total_price ?? null
      }

      const { data: invData, error: invErr } = await supabase
        .from('invoices')
        .insert(invoicePayload)
        .select('id').single()

      if (invErr || !invData) {
        setGlobalError(`Rechnung konnte nicht erstellt werden. (${invErr?.message ?? 'Unbekannter Fehler'})`)
        setProcessing(false)
        return
      }
      invoiceId = invData.id
    }

    // ── 2. Check out primary reservation ─────────────────────────────────
    const { error: updateError } = await supabase
      .from('reservations')
      .update({
        status:         'checked_out',
        payment_status: 'paid',
        payment_method: payMethod,
        ...(earlyDeparture && { total_price: finalPrice }),
      })
      .eq('id', pending.id)

    if (updateError) { setGlobalError('Checkout fehlgeschlagen.'); setProcessing(false); return }

    // Set room → Reinigen
    await supabase.from('rooms').update({ cleaning_status: 'dirty', cleaning_updated_at: now })
      .eq('id', pending.room_id)

    // ── 3. Family rooms ───────────────────────────────────────────────────
    if (pending.family_booking_id) {
      await supabase.from('reservations')
        .update({ status: 'checked_out', payment_status: 'paid', payment_method: payMethod })
        .eq('family_booking_id', pending.family_booking_id).neq('id', pending.id)

      const { data: siblings } = await supabase.from('reservations')
        .select('room_id').eq('family_booking_id', pending.family_booking_id).neq('id', pending.id)
      for (const s of (siblings ?? []))
        await supabase.from('rooms').update({ cleaning_status: 'dirty', cleaning_updated_at: now }).eq('id', s.room_id)
    }

    // ── 4. Update local state ─────────────────────────────────────────────
    setReservations(prev => prev.map(res =>
      res.id === pending.id
        ? { ...res, status: 'checked_out' as const, payment_status: 'paid' as const, payment_method: payMethod as any, ...(earlyDeparture && { total_price: finalPrice }) }
        : res,
    ))

    setProcessing(false)
    setCreatedInvoiceId(invoiceId)
    if (!invoiceId) closeModal()
  }

  // ── admin: un-checkout ────────────────────────────────────────────────────
  async function handleUnCheckout(r: ReservationWithRoom) {
    setUndoing(r.id)
    await supabase.from('reservations').update({ status: 'checked_in' }).eq('id', r.id)
    if (r.family_booking_id)
      await supabase.from('reservations').update({ status: 'checked_in' })
        .eq('family_booking_id', r.family_booking_id).neq('id', r.id)
    setReservations(prev => prev.map(res => res.id === r.id ? { ...res, status: 'checked_in' as const } : res))
    setUndoing(null)
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {globalError && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm flex items-center justify-between">
          <span>{globalError}</span>
          <button onClick={() => setGlobalError(null)} className="ml-3 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* ── Heute / Morgen / Übermorgen sections ─────────────────────────── */}
      {[
        { rows: todayRows,      label: 'Heute',        date: today,      accent: 'border-slate-900 bg-slate-900 text-white' },
        { rows: tomorrowRows,   label: 'Morgen',       date: tomorrow,   accent: 'border-blue-600  bg-blue-600  text-white' },
        { rows: overmorrowRows, label: 'Übermorgen',   date: overmorrow, accent: 'border-violet-600 bg-violet-600 text-white' },
      ].map(({ rows, label, date, accent }) => rows.length > 0 && (
        <div key={label} className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <span className={cn('rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wide', accent)}>
              {label}
            </span>
            <span className="text-sm text-slate-500">
              {format(new Date(date), 'EEEE, d. MMMM', { locale: de })} · {rows.length} Abreise{rows.length !== 1 ? 'n' : ''}
            </span>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[540px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th className="px-4 py-3 font-semibold text-slate-600">Zimmer</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Gast</th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-600">Pers.</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Uhrzeit</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Zahlung</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-900">
                        Zi. {r.rooms.room_number}
                        <span className="ml-1.5 text-xs font-normal text-slate-400 hidden sm:inline">{r.rooms.name}</span>
                        {r.family_booking_id && <span className="ml-1.5 text-2xs bg-purple-100 text-purple-600 rounded-full px-1.5 py-0.5 font-semibold">Familie</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{r.guest_name}</div>
                        {r.guest_phone && <div className="text-xs text-slate-400">{r.guest_phone}</div>}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600">{r.guest_count}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {new Date(r.checkout_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                          r.payment_status === 'paid'         ? 'bg-green-100 text-green-700'  :
                          r.payment_status === 'deposit_paid' ? 'bg-yellow-100 text-yellow-700' :
                                                                'bg-red-100 text-red-700',
                        )}>
                          {r.payment_status === 'paid' ? 'Bezahlt' : r.payment_status === 'deposit_paid' ? 'Anzahlung' : 'Offen'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openModal(r)}
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors">
                          <LogOut className="w-4 h-4" />Auschecken
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}

      {/* ── Bereits ausgecheckt – letzte 3 Tage ──────────────────────────── */}
      {departed.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Bereits ausgecheckt – letzte 3 Tage ({departed.length})
          </h2>
          <CheckedOutTable rows={departed} isAdmin={isAdmin} undoing={undoing} onUndo={handleUnCheckout} />
        </div>
      )}

      {/* ── Admin archive ─────────────────────────────────────────────────── */}
      {isAdmin && archive.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-amber-600 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Archiv – älter als 3 Tage (nur Admin) ({archive.length})
          </h2>
          <CheckedOutTable rows={archive} isAdmin={isAdmin} undoing={undoing} onUndo={handleUnCheckout} />
        </div>
      )}

      {reservations.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-16 text-center">
          <LogOut className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Keine Abreisen in diesem Zeitraum.</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          CHECKOUT MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative z-10 w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h2 className="font-bold text-slate-900">Auschecken</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {pending.guest_name} · Zi. {pending.rooms.room_number}
                  {pending.family_booking_id && <span className="ml-1 text-purple-600 font-medium">(Familienzimmer)</span>}
                </p>
              </div>
              <button onClick={closeModal} disabled={processing} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── Success ───────────────────────────────────────────────── */}
            {createdInvoiceId ? (
              <div className="p-6 text-center space-y-4">
                <div className="text-4xl">✅</div>
                <p className="font-semibold text-slate-900">Gast wurde ausgecheckt</p>
                <p className="text-sm text-slate-500">Rechnung wurde erfolgreich erstellt.</p>
                <a href={`/invoices/${createdInvoiceId}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors">
                  <FileText className="w-4 h-4" />Rechnung öffnen &amp; drucken
                </a>
                <div><button onClick={closeModal} className="text-sm text-slate-400 hover:text-slate-600">Schließen</button></div>
              </div>

            ) : step === 'payment' ? (
              /* ── Step 1: Zahlung ──────────────────────────────────────── */
              <div className="p-5 space-y-5">
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-3">Hat der Gast bezahlt?</p>
                  <div className="flex gap-3">
                    <button onClick={() => setHasPaid(true)} className={cn(
                      'flex-1 rounded-xl border-2 py-3 text-sm font-semibold transition-colors',
                      hasPaid ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-500 hover:border-slate-300',
                    )}>✅ Ja, bezahlt</button>
                    <button onClick={() => setHasPaid(false)} className={cn(
                      'flex-1 rounded-xl border-2 py-3 text-sm font-semibold transition-colors',
                      !hasPaid ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 text-slate-500 hover:border-slate-300',
                    )}>❌ Nein, offen</button>
                  </div>
                </div>

                {hasPaid && (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-2">Zahlungsart</p>
                    <div className="grid grid-cols-2 gap-2">
                      {PAY_METHODS.map(m => (
                        <button key={m.value} onClick={() => setPayMethod(m.value)} className={cn(
                          'rounded-xl border-2 py-2.5 text-sm font-medium transition-colors',
                          payMethod === m.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300',
                        )}>{m.label}</button>
                      ))}
                    </div>
                  </div>
                )}

                {!hasPaid && (
                  <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    ⚠️ Gast muss zuerst bezahlen, bevor er ausgecheckt werden kann.
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button onClick={closeModal} className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                    Abbrechen
                  </button>
                  <button onClick={() => setStep('details')} disabled={!hasPaid}
                    className="flex-1 rounded-xl bg-slate-900 text-white py-2.5 text-sm font-semibold hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    Weiter →
                  </button>
                </div>
              </div>

            ) : (
              /* ── Step 2: Vorzeitige Abreise + Rechnung ────────────────── */
              <div className="p-5 space-y-5">

                {/* Early departure */}
                <div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={earlyDeparture} onChange={e => setEarlyDeparture(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        Vorzeitige Abreise
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">Gast ist früher als geplant abgereist</p>
                    </div>
                  </label>

                  {earlyDeparture && (
                    <div className="mt-3 ml-7 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Tatsächliche Nächte</label>
                          <input type="number" min={1}
                            value={actualNights}
                            onChange={e => setActualNights(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div className="flex-1">
                          <label className="text-xs font-semibold text-slate-600 block mb-1">Aktueller Preis (€)</label>
                          <input type="number" min={0} step={0.01}
                            value={actualPrice}
                            onChange={e => setActualPrice(e.target.value)}
                            placeholder={pending.total_price != null ? String(pending.total_price) : '0.00'}
                            className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50" />
                        </div>
                      </div>
                      {pending.total_price != null && (
                        <p className="text-xs text-slate-500">
                          Ursprünglich: {differenceInCalendarDays(new Date(pending.checkout_at), new Date(pending.checkin_at))} Nächte · €{pending.total_price.toFixed(2)}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Invoice */}
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">Rechnung erstellen?</p>
                  <div className="flex gap-3">
                    <button onClick={() => setWantInvoice(false)} className={cn(
                      'flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors',
                      !wantInvoice ? 'border-slate-800 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300',
                    )}>Nein</button>
                    <button onClick={() => setWantInvoice(true)} className={cn(
                      'flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors',
                      wantInvoice ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300',
                    )}>
                      <FileText className="w-4 h-4 inline mr-1.5" />Ja, Rechnung
                    </button>
                  </div>

                  {wantInvoice && (
                    <div className="mt-2 rounded-xl bg-blue-50 border border-blue-200 px-3 py-2.5 text-xs text-blue-700 space-y-0.5">
                      <p><strong>{pending.guest_name}</strong> · Zi. {pending.rooms.room_number}</p>
                      <p>
                        {earlyDeparture && actualNights > 0 ? actualNights : differenceInCalendarDays(new Date(pending.checkout_at), new Date(pending.checkin_at))} Nacht/Nächte ·
                        €{earlyDeparture && actualPrice !== '' ? parseFloat(actualPrice).toFixed(2) : (pending.total_price ?? 0).toFixed(2)} ·
                        {PAY_LABELS[payMethod]}
                        {earlyDeparture && <span className="ml-1 text-amber-600 font-semibold">· Vorzeitige Abreise</span>}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-1">
                  <button onClick={() => setStep('payment')} disabled={processing}
                    className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                    ← Zurück
                  </button>
                  <button onClick={doCheckout} disabled={processing}
                    className="flex-1 rounded-xl bg-green-600 text-white py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                    {processing ? 'Wird verarbeitet…' : '✅ Jetzt auschecken'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ─── Checked-out table sub-component ─────────────────────────────────────────

function CheckedOutTable({ rows, isAdmin, undoing, onUndo }: {
  rows: ReservationWithRoom[]
  isAdmin: boolean
  undoing: string | null
  onUndo: (r: ReservationWithRoom) => void
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-3 font-semibold text-slate-600">Zimmer</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Gast</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Abreise</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Zahlung</th>
              {isAdmin && <th className="px-4 py-3 font-semibold text-slate-600">Admin</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-bold text-slate-700">
                  Zi. {r.rooms.room_number}
                  <span className="ml-1.5 text-xs font-normal text-slate-400 hidden sm:inline">{r.rooms.name}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800 flex items-center gap-1.5">
                    {r.guest_name}
                    {(r as any).early_departure && (
                      <span className="inline-flex rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-2xs font-semibold">
                        ⚡ Früh
                      </span>
                    )}
                  </div>
                  {r.guest_phone && <div className="text-xs text-slate-400">{r.guest_phone}</div>}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                  {new Date(r.checkout_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </td>
                <td className="px-4 py-3">
                  <div className={cn(
                    'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                    r.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
                  )}>
                    {r.payment_status === 'paid' ? 'Bezahlt' : 'Offen'}
                  </div>
                  {r.total_price != null && (
                    <div className="text-xs text-slate-400 mt-0.5">€{r.total_price.toFixed(2)}</div>
                  )}
                </td>
                {isAdmin && (
                  <td className="px-4 py-3">
                    <button onClick={() => onUndo(r)} disabled={undoing === r.id} title="Checkout rückgängig (Admin/Test)"
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 px-2.5 py-1.5 text-xs font-medium hover:bg-amber-100 disabled:opacity-50 transition-colors">
                      <Undo2 className="w-3.5 h-3.5" />{undoing === r.id ? '…' : 'Rückgängig'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
