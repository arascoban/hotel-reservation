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
  // Non-breaking space: on a narrow screen a normal one lets the € wrap onto
  // its own line, which is what made amounts break apart in the e-mails.
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}


// ─── Payment ledger ──────────────────────────────────────────────────────────

export type PaymentKind = 'deposit' | 'payment' | 'refund'

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  deposit: 'Anzahlung',
  payment: 'Zahlung',
  refund:  'Erstattung',
}

export const PAYMENT_KINDS: { value: PaymentKind; label: string }[] = [
  { value: 'deposit', label: 'Anzahlung' },
  { value: 'payment', label: 'Zahlung (Restbetrag)' },
  { value: 'refund',  label: 'Erstattung' },
]

export interface PaymentRow {
  id:              string
  reservation_id?: string | null
  invoice_id?:     string | null
  kind:            PaymentKind
  amount:          number
  paid_on:         string          // yyyy-MM-dd
  method:          string
  note?:           string | null
}

/** Refunds give money back, so they count against what has been received. */
export function signedAmount(p: Pick<PaymentRow, 'kind' | 'amount'>): number {
  return p.kind === 'refund' ? -Number(p.amount) : Number(p.amount)
}

export interface LedgerSummary {
  payments:    PaymentRow[]
  /** Sum of everything received (refunds subtracted). */
  totalPaid:   number
  /** Total minus received — what is still open. */
  remaining:   number
  /** Nothing left to pay. */
  settled:     boolean
  /** Some money arrived, but not all of it. */
  partly:      boolean
  /** The deposit portion specifically. */
  depositPaid: number
}

/**
 * Roll a list of payments up against a gross total.
 * Payments are returned sorted by date so the invoice lists them in the
 * order they happened.
 */
export function summarizeLedger(payments: PaymentRow[], total: number): LedgerSummary {
  const sorted = [...payments].sort((a, b) => a.paid_on.localeCompare(b.paid_on))
  const totalPaid = round2(sorted.reduce((s, p) => s + signedAmount(p), 0))
  const remaining = round2(Math.max(0, total - totalPaid))

  return {
    payments:    sorted,
    totalPaid,
    remaining,
    settled:     totalPaid > 0 && remaining <= 0.004,
    partly:      totalPaid > 0 && remaining > 0.004,
    depositPaid: round2(sorted.filter(p => p.kind === 'deposit')
                              .reduce((s, p) => s + signedAmount(p), 0)),
  }
}

/**
 * Payment terms for the remaining balance.
 * The hotel gives guests three working days after check-out to settle.
 */
export const REMAINING_DUE_WORKDAYS = 3

export const REMAINING_DUE_TEXT =
  `Der Restbetrag ist innerhalb von ${REMAINING_DUE_WORKDAYS} Werktagen nach dem Check-out zu begleichen.`

/** Check-out + N working days (skips Sat/Sun). */
export function addWorkdays(from: string | Date, days: number): Date {
  const d = new Date(from)
  let left = days
  while (left > 0) {
    d.setDate(d.getDate() + 1)
    const wd = d.getDay()
    if (wd !== 0 && wd !== 6) left--
  }
  return d
}
