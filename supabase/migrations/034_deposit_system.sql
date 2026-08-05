-- Migration: 034_deposit_system.sql
-- Anzahlung (deposit / prepayment) system.
--
-- Two separate concepts, deliberately kept apart:
--   1. REQUIRED deposit  — what the guest is asked to pay up front.
--      Defined as a percentage of the total or as a fixed amount. The
--      resolved euro amount is stored so it stays stable even if the total
--      price is edited later.
--   2. RECEIVED deposit  — what actually arrived: amount, date and method.
--      Only set once the money is in; drives the "Restbetrag" on the invoice
--      and unlocks the payment-confirmation e-mail.
--
-- Both reservations and invoices carry the fields: a booking confirmation
-- shows the deposit before any invoice exists, and free-text invoices have
-- no reservation to inherit from.

-- ── Reservations ─────────────────────────────────────────────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS deposit_mode          TEXT,          -- 'percent' | 'fixed' | NULL (= no deposit)
  ADD COLUMN IF NOT EXISTS deposit_percent       NUMERIC(5,2),  -- used when mode = 'percent'
  ADD COLUMN IF NOT EXISTS deposit_amount        NUMERIC(10,2), -- resolved amount the guest must pay
  ADD COLUMN IF NOT EXISTS deposit_due_date      DATE,          -- optional "zahlbar bis"
  ADD COLUMN IF NOT EXISTS deposit_paid_amount   NUMERIC(10,2), -- what actually arrived
  ADD COLUMN IF NOT EXISTS deposit_paid_at       TIMESTAMPTZ,   -- when it arrived
  ADD COLUMN IF NOT EXISTS deposit_paid_method   TEXT,          -- cash | ec_card | credit_card | online | bank_transfer
  ADD COLUMN IF NOT EXISTS deposit_email_sent_at TIMESTAMPTZ;   -- when the thank-you mail went out

-- ── Invoices ─────────────────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS deposit_mode          TEXT,
  ADD COLUMN IF NOT EXISTS deposit_percent       NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS deposit_amount        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS deposit_due_date      DATE,
  ADD COLUMN IF NOT EXISTS deposit_paid_amount   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS deposit_paid_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposit_paid_method   TEXT,
  ADD COLUMN IF NOT EXISTS deposit_email_sent_at TIMESTAMPTZ;

-- Deposits are only meaningful in one of the two supported shapes.
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_deposit_mode_check;
ALTER TABLE reservations
  ADD CONSTRAINT reservations_deposit_mode_check
  CHECK (deposit_mode IS NULL OR deposit_mode IN ('percent', 'fixed'));

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_deposit_mode_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_deposit_mode_check
  CHECK (deposit_mode IS NULL OR deposit_mode IN ('percent', 'fixed'));

-- Finding reservations still waiting for their deposit
CREATE INDEX IF NOT EXISTS idx_reservations_deposit_open
  ON reservations (deposit_amount)
  WHERE deposit_amount IS NOT NULL AND deposit_paid_at IS NULL;

-- ── Default deposit percentage (admin setting) ───────────────────────────────
-- Pre-fills the deposit field on new bookings; always editable per booking.
ALTER TABLE invoice_settings
  ADD COLUMN IF NOT EXISTS default_deposit_percent NUMERIC(5,2) NOT NULL DEFAULT 30;
