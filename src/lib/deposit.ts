/**
 * Anzahlung (deposit) helpers — shared by reservations, invoices, the PDF
 * and both e-mail templates so every surface agrees on the numbers.
 */

export type DepositMode = 'percent' | 'fixed'

export const DEPOSIT_METHODS = [
  { value: 'cash',          label: 'Bar' },
  { value: 'bank_transfer', label: 'Überweisung' },
  { value: 'ec_card',       label: 'EC-Karte' },
  { value: 'credit_card',   label: 'Kreditkarte' },
  { value: 'online',        label: 'Online' },
] as const

export const DEPOSIT_METHOD_LABELS: Record<string, string> = {
  cash:          'Bar',
  bank_transfer: 'Überweisung',
  ec_card:       'EC-Karte',
  credit_card:   'Kreditkarte',
  online:        'Online',
}

export interface DepositFields {
  deposit_mode?:        string | null
  deposit_percent?:     number | null
  deposit_amount?:      number | null
  deposit_due_date?:    string | null
  deposit_paid_amount?: number | null
  deposit_paid_at?:     string | null
  deposit_paid_method?: string | null
}

/** Round to cents — deposits are money, never carry float noise into the PDF. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Resolve the required deposit into euros.
 * Percentages are taken from the given total; fixed amounts pass through.
 * Returns 0 when no deposit is configured.
 */
export function resolveDepositAmount(
  mode: string | null | undefined,
  percent: number | null | undefined,
  fixedAmount: number | null | undefined,
  total: number,
): number {
  if (mode === 'percent') {
    const p = Number(percent ?? 0)
    if (!p || p <= 0) return 0
    return round2((total * p) / 100)
  }
  if (mode === 'fixed') {
    const a = Number(fixedAmount ?? 0)
    return a > 0 ? round2(a) : 0
  }
  return 0
}

export interface DepositSummary {
  /** A deposit is configured (required from the guest). */
  required:     boolean
  /** Euro amount the guest was asked to pay. */
  requiredAmount: number
  /** Money has actually arrived. */
  paid:         boolean
  /** Euro amount received. */
  paidAmount:   number
  paidAt:       string | null
  paidMethod:   string | null
  paidMethodLabel: string
  /** Total minus what was received — what is still open. */
  remaining:    number
  /** Deposit covers the whole bill. */
  fullySettled: boolean
}

/**
 * Single source of truth for how a deposit affects a total.
 * `total` is the gross grand total (after any discount).
 */
export function summarizeDeposit(d: DepositFields, total: number): DepositSummary {
  const requiredAmount = d.deposit_amount != null
    ? round2(Number(d.deposit_amount))
    : resolveDepositAmount(d.deposit_mode, d.deposit_percent, d.deposit_amount, total)

  const paidAmount = d.deposit_paid_amount != null ? round2(Number(d.deposit_paid_amount)) : 0
  const paid       = paidAmount > 0 && !!d.deposit_paid_at
  const remaining  = round2(Math.max(0, total - paidAmount))

  return {
    required:        requiredAmount > 0,
    requiredAmount,
    paid,
    paidAmount,
    paidAt:          d.deposit_paid_at ?? null,
    paidMethod:      d.deposit_paid_method ?? null,
    paidMethodLabel: DEPOSIT_METHOD_LABELS[d.deposit_paid_method ?? ''] ?? (d.deposit_paid_method ?? ''),
    remaining,
    fullySettled:    paid && remaining <= 0.004,
  }
}

/** German date for documents & e-mails: 2026-08-05 → 05.08.2026 */
export function formatDeDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** Euro formatting matching the invoice PDF. */
export function eur(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}
