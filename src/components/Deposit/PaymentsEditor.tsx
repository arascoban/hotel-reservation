'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'
import {
  PAYMENT_KINDS, PAYMENT_KIND_LABELS, DEPOSIT_METHODS, DEPOSIT_METHOD_LABELS,
  summarizeLedger, formatDeDate, eur, round2, type PaymentRow, type PaymentKind,
} from '@/lib/deposit'
import { Plus, Trash2, Loader2, Wallet, CheckCircle2 } from 'lucide-react'

interface Props {
  /** One of these — the ledger row is attached to whichever is given. */
  reservationId?: string
  invoiceId?:     string
  /** Gross grand total the remaining balance is measured against. */
  total:          number
  /** Fires after any change so the parent can refresh its own view. */
  onChanged?:     () => void
  className?:     string
}

const inp = 'w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'

/**
 * Ledger of received payments. Anzahlung and the later Restbetrag payment are
 * separate rows with their own date and method, exactly as they appear on the
 * invoice.
 */
export default function PaymentsEditor({
  reservationId, invoiceId, total, onChanged, className,
}: Props) {
  const supabase = createClient()
  const [rows,    setRows]    = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState(false)
  const [adding,  setAdding]  = useState(false)

  // New-row draft
  const [kind,     setKind]     = useState<PaymentKind>('deposit')
  const [amount,   setAmount]   = useState('')
  const [paidOn,   setPaidOn]   = useState(new Date().toISOString().slice(0, 10))
  const [method,   setMethod]   = useState('bank_transfer')
  // Deposits can be entered as a share of the total instead of a euro amount
  const [depMode,  setDepMode]  = useState<'fixed' | 'percent'>('percent')
  const [percent,  setPercent]  = useState('30')

  // Effective euro amount for the row being added
  const draftAmount = kind === 'deposit' && depMode === 'percent'
    ? round2((total * (parseFloat(percent) || 0)) / 100)
    : (parseFloat(amount) || 0)

  const load = useCallback(async () => {
    if (!reservationId && !invoiceId) { setLoading(false); return }
    const q = supabase.from('payments').select('*').order('paid_on')
    const { data } = invoiceId
      ? await q.eq('invoice_id', invoiceId)
      : await q.eq('reservation_id', reservationId!)
    setRows((data ?? []) as PaymentRow[])
    setLoading(false)
  }, [supabase, reservationId, invoiceId])

  useEffect(() => { load() }, [load])

  // Pre-fill the hotel's configured default deposit percentage
  useEffect(() => {
    supabase.from('invoice_settings').select('default_deposit_percent').eq('id', 1).single()
      .then(({ data }) => {
        const pct = (data as { default_deposit_percent?: number } | null)?.default_deposit_percent
        if (pct != null && pct > 0) setPercent(String(pct))
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ledger = summarizeLedger(rows, total)

  // Default the next entry to whatever is still open
  function startAdd() {
    const firstEntry = rows.length === 0
    setKind(firstEntry ? 'deposit' : 'payment')
    // A deposit defaults to the configured percentage, anything else to
    // whatever is still open.
    setDepMode(firstEntry ? 'percent' : 'fixed')
    setAmount(ledger.remaining > 0 ? String(ledger.remaining.toFixed(2)) : '')
    setPaidOn(new Date().toISOString().slice(0, 10))
    setMethod('bank_transfer')
    setAdding(true)
  }

  async function addPayment() {
    const amt = draftAmount
    if (!amt || amt <= 0 || !paidOn) return
    setBusy(true)
    const { data } = await supabase.from('payments').insert({
      reservation_id: invoiceId ? null : reservationId,
      invoice_id:     invoiceId ?? null,
      kind, amount: amt, paid_on: paidOn, method,
      created_by: (await supabase.auth.getUser()).data.user?.email ?? null,
    }).select('*').single()

    if (data) setRows(prev => [...prev, data as PaymentRow])
    setAdding(false)
    setAmount('')
    setBusy(false)
    onChanged?.()
  }

  async function removePayment(id: string) {
    setBusy(true)
    await supabase.from('payments').delete().eq('id', id)
    setRows(prev => prev.filter(r => r.id !== id))
    setBusy(false)
    onChanged?.()
  }

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3', className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-slate-500" />
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            Zahlungen
          </h3>
        </div>
        {!adding && (
          <button type="button" onClick={startAdd}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
            <Plus className="w-3.5 h-3.5" /> Zahlung erfassen
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Lädt…</p>
      ) : (
        <>
          {/* ── Recorded payments ─────────────────────────────────────────── */}
          {rows.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="text-left  px-3 py-2 font-semibold">Datum</th>
                    <th className="text-left  px-3 py-2 font-semibold">Art</th>
                    <th className="text-left  px-3 py-2 font-semibold">Zahlungsart</th>
                    <th className="text-right px-3 py-2 font-semibold">Betrag</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.payments.map(p => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{formatDeDate(p.paid_on)}</td>
                      <td className="px-3 py-2">
                        <span className={cn(
                          'inline-flex rounded-full px-2 py-0.5 font-medium',
                          p.kind === 'deposit' ? 'bg-blue-100 text-blue-700'
                          : p.kind === 'refund' ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700',
                        )}>
                          {PAYMENT_KIND_LABELS[p.kind]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {DEPOSIT_METHOD_LABELS[p.method] ?? p.method}
                      </td>
                      <td className={cn(
                        'px-3 py-2 text-right font-semibold whitespace-nowrap',
                        p.kind === 'refund' ? 'text-red-600' : 'text-slate-900',
                      )}>
                        {p.kind === 'refund' ? '+ ' : '− '}{eur(Number(p.amount))}
                      </td>
                      <td className="px-1 py-2 text-center">
                        <button type="button" onClick={() => removePayment(p.id)} disabled={busy}
                          className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── New payment ───────────────────────────────────────────────── */}
          {adding && (
            <div className="rounded-lg border border-blue-200 bg-white p-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Art</label>
                  <select value={kind} onChange={e => setKind(e.target.value as PaymentKind)} className={inp}>
                    {PAYMENT_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
                {/* A deposit may be given as a share of the total or as a
                    plain euro amount — the toggle only appears for deposits. */}
                {kind === 'deposit' ? (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Betrag</label>
                    <div className="flex gap-1">
                      <select value={depMode}
                        onChange={e => setDepMode(e.target.value as 'fixed' | 'percent')}
                        className={cn(inp, 'w-[86px] flex-shrink-0')}>
                        <option value="percent">%</option>
                        <option value="fixed">€</option>
                      </select>
                      {depMode === 'percent' ? (
                        <input type="number" min={0} max={100} step="1" value={percent}
                          onChange={e => setPercent(e.target.value)} className={inp} placeholder="30" />
                      ) : (
                        <input type="number" min={0.01} step="0.01" value={amount}
                          onChange={e => setAmount(e.target.value)} className={inp} placeholder="0.00" />
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Betrag (€)</label>
                    <input type="number" min={0.01} step="0.01" value={amount}
                      onChange={e => setAmount(e.target.value)} className={inp} placeholder="0.00" />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Datum</label>
                  <input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Zahlungsart</label>
                  <select value={method} onChange={e => setMethod(e.target.value)} className={inp}>
                    {DEPOSIT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {kind === 'deposit' && depMode === 'percent' && (
                  <span className="text-xs text-slate-500">
                    {percent || 0} % von {eur(total)} = <strong className="text-slate-800">{eur(draftAmount)}</strong>
                  </span>
                )}
                <div className="flex justify-end gap-2 ml-auto">
                  <button type="button" onClick={() => setAdding(false)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                    Abbrechen
                  </button>
                  <button type="button" onClick={addPayment}
                    disabled={busy || draftAmount <= 0 || !paidOn}
                    className="rounded-lg bg-blue-600 text-white px-4 py-1.5 text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                    {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                    Hinzufügen
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Balance ───────────────────────────────────────────────────── */}
          {(rows.length > 0 || total > 0) && (
            <div className={cn(
              'rounded-lg border px-3 py-2.5 text-sm',
              ledger.settled ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white',
            )}>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Gesamtbetrag</span>
                <span className="font-medium text-slate-800">{eur(total)}</span>
              </div>
              {ledger.totalPaid !== 0 && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-slate-500">Bezahlt</span>
                  <span className="font-medium text-green-700">− {eur(ledger.totalPaid)}</span>
                </div>
              )}
              <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-200">
                <span className="font-semibold text-slate-700">Restbetrag</span>
                <span className={cn('font-bold', ledger.settled ? 'text-green-700' : 'text-slate-900')}>
                  {eur(ledger.remaining)}
                </span>
              </div>
              {ledger.settled && (
                <p className="flex items-center gap-1.5 text-xs text-green-700 mt-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Vollständig bezahlt
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
