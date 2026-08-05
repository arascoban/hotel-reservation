'use client'

import { cn } from '@/lib/cn'
import { DEPOSIT_METHODS, resolveDepositAmount, eur } from '@/lib/deposit'
import { Wallet, CheckCircle2 } from 'lucide-react'

export interface DepositState {
  mode:       '' | 'percent' | 'fixed'
  percent:    string
  amount:     string
  dueDate:    string
  paidAmount: string
  paidDate:   string   // yyyy-MM-dd
  paidMethod: string
}

export const EMPTY_DEPOSIT: DepositState = {
  mode: '', percent: '', amount: '', dueDate: '',
  paidAmount: '', paidDate: '', paidMethod: 'bank_transfer',
}

/** Build the DB payload for the deposit columns from the editor state. */
export function depositPayload(d: DepositState, total: number) {
  const required = d.mode
    ? resolveDepositAmount(d.mode, parseFloat(d.percent) || 0, parseFloat(d.amount) || 0, total)
    : 0
  const paid = parseFloat(d.paidAmount) || 0
  return {
    deposit_mode:        d.mode || null,
    deposit_percent:     d.mode === 'percent' ? (parseFloat(d.percent) || null) : null,
    deposit_amount:      required > 0 ? required : null,
    deposit_due_date:    d.dueDate || null,
    deposit_paid_amount: paid > 0 ? paid : null,
    // Store noon local time so the date never slips a day across time zones
    deposit_paid_at:     paid > 0 && d.paidDate ? new Date(`${d.paidDate}T12:00:00`).toISOString() : null,
    deposit_paid_method: paid > 0 ? d.paidMethod : null,
  }
}

/** Hydrate editor state from a reservation/invoice row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function depositFromRow(row: any): DepositState {
  return {
    mode:       (row?.deposit_mode as DepositState['mode']) ?? '',
    percent:    row?.deposit_percent   != null ? String(row.deposit_percent)   : '',
    amount:     row?.deposit_amount    != null ? String(row.deposit_amount)    : '',
    dueDate:    row?.deposit_due_date  ?? '',
    paidAmount: row?.deposit_paid_amount != null ? String(row.deposit_paid_amount) : '',
    paidDate:   row?.deposit_paid_at   ? String(row.deposit_paid_at).slice(0, 10) : '',
    paidMethod: row?.deposit_paid_method ?? 'bank_transfer',
  }
}

const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

interface Props {
  value:        DepositState
  onChange:     (d: DepositState) => void
  /** Gross grand total the percentage is calculated from. */
  total:        number
  /** Hide the "payment received" block (e.g. on the create-reservation form). */
  hidePayment?: boolean
  className?:   string
}

export default function DepositEditor({
  value, onChange, total, hidePayment = false, className,
}: Props) {
  const set = (patch: Partial<DepositState>) => onChange({ ...value, ...patch })

  const required = value.mode
    ? resolveDepositAmount(value.mode, parseFloat(value.percent) || 0, parseFloat(value.amount) || 0, total)
    : 0
  const paid      = parseFloat(value.paidAmount) || 0
  const remaining = Math.max(0, total - paid)

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4', className)}>
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-slate-500" />
        <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Anzahlung</h3>
      </div>

      {/* ── Required deposit ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Art</label>
          <select value={value.mode} onChange={e => set({ mode: e.target.value as DepositState['mode'] })}
            className={inp}>
            <option value="">Keine Anzahlung</option>
            <option value="percent">Prozent vom Gesamt</option>
            <option value="fixed">Fester Betrag</option>
          </select>
        </div>

        {value.mode === 'percent' && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">Prozent (%)</label>
            <input type="number" min={0} max={100} step="1" value={value.percent}
              onChange={e => set({ percent: e.target.value })}
              className={inp} placeholder="30" />
          </div>
        )}

        {value.mode === 'fixed' && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">Betrag (€)</label>
            <input type="number" min={0} step="0.01" value={value.amount}
              onChange={e => set({ amount: e.target.value })}
              className={inp} placeholder="100.00" />
          </div>
        )}

        {value.mode && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">Zahlbar bis (optional)</label>
            <input type="date" value={value.dueDate}
              onChange={e => set({ dueDate: e.target.value })} className={inp} />
          </div>
        )}
      </div>

      {value.mode && (
        <div className="flex items-center justify-between rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm">
          <span className="text-slate-500">Geforderte Anzahlung</span>
          <span className="font-bold text-slate-900">{eur(required)}</span>
        </div>
      )}

      {/* ── Payment received ────────────────────────────────────────────── */}
      {!hidePayment && (
        <div className="pt-3 border-t border-slate-200 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Zahlung erhalten
            </p>
            {required > 0 && !paid && (
              <button type="button"
                onClick={() => set({
                  paidAmount: String(required),
                  paidDate:   value.paidDate || new Date().toISOString().slice(0, 10),
                })}
                className="text-xs font-medium text-blue-600 hover:text-blue-700">
                Vollen Betrag eintragen
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Erhaltener Betrag (€)</label>
              <input type="number" min={0} step="0.01" value={value.paidAmount}
                onChange={e => set({ paidAmount: e.target.value })}
                className={inp} placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Zahlungsdatum</label>
              <input type="date" value={value.paidDate}
                onChange={e => set({ paidDate: e.target.value })} className={inp} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Zahlungsart</label>
              <select value={value.paidMethod} onChange={e => set({ paidMethod: e.target.value })}
                className={inp}>
                {DEPOSIT_METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {paid > 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 space-y-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-green-800">
                <CheckCircle2 className="w-4 h-4" />
                Anzahlung erhalten: {eur(paid)}
              </p>
              {total > 0 && (
                <p className="text-xs text-green-700">
                  Restbetrag: <strong>{eur(remaining)}</strong>
                  {remaining <= 0.004 && ' — vollständig bezahlt'}
                </p>
              )}
              {!value.paidDate && (
                <p className="text-xs text-amber-700">⚠ Bitte ein Zahlungsdatum wählen.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
