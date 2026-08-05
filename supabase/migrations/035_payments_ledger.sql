-- Migration: 035_payments_ledger.sql
-- Multiple payments per booking/invoice instead of a single deposit field.
--
-- An Anzahlung and the later Restbetrag payment are different events: they
-- happen on different dates, often with different methods, and the invoice
-- has to list both. A single set of deposit_paid_* columns cannot express
-- that, so payments move into their own ledger.
--
-- The REQUIRED deposit (deposit_mode / deposit_percent / deposit_amount /
-- deposit_due_date) stays on reservations and invoices — that is a rule, not
-- a payment. Only the "received" side moves here.

CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- A payment belongs to a booking, an invoice, or both. Recording it on the
  -- reservation makes it show up on any invoice created from that booking.
  reservation_id UUID REFERENCES reservations (id) ON DELETE CASCADE,
  invoice_id     UUID REFERENCES invoices     (id) ON DELETE CASCADE,

  kind           TEXT           NOT NULL DEFAULT 'payment',  -- deposit | payment | refund
  amount         NUMERIC(10,2)  NOT NULL,
  paid_on        DATE           NOT NULL,
  method         TEXT           NOT NULL DEFAULT 'bank_transfer',
  note           TEXT,

  created_by     TEXT,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT payments_kind_check
    CHECK (kind IN ('deposit', 'payment', 'refund')),
  CONSTRAINT payments_amount_check
    CHECK (amount > 0),
  -- Must hang off something, otherwise it can never be found again
  CONSTRAINT payments_owner_check
    CHECK (reservation_id IS NOT NULL OR invoice_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_payments_reservation ON payments (reservation_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice     ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_on     ON payments (paid_on);

CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_updated_at_trigger ON payments;
CREATE TRIGGER payments_updated_at_trigger
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_payments_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select" ON payments;
CREATE POLICY "payments_select" ON payments
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "payments_insert" ON payments;
CREATE POLICY "payments_insert" ON payments
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "payments_update" ON payments;
CREATE POLICY "payments_update" ON payments
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "payments_delete" ON payments;
CREATE POLICY "payments_delete" ON payments
  FOR DELETE TO authenticated USING (true);


-- ── Backfill from the old single-deposit columns ─────────────────────────────
-- Each recorded deposit becomes one ledger row. Runs only once because of the
-- NOT EXISTS guard, so re-running the migration is safe.

INSERT INTO payments (reservation_id, kind, amount, paid_on, method, note, created_at)
SELECT r.id, 'deposit', r.deposit_paid_amount, r.deposit_paid_at::date,
       COALESCE(r.deposit_paid_method, 'bank_transfer'),
       'Übernommen aus Anzahlungsfeld', r.deposit_paid_at
FROM   reservations r
WHERE  r.deposit_paid_amount IS NOT NULL
  AND  r.deposit_paid_amount > 0
  AND  r.deposit_paid_at IS NOT NULL
  AND  NOT EXISTS (SELECT 1 FROM payments p WHERE p.reservation_id = r.id);

INSERT INTO payments (invoice_id, kind, amount, paid_on, method, note, created_at)
SELECT i.id, 'deposit', i.deposit_paid_amount, i.deposit_paid_at::date,
       COALESCE(i.deposit_paid_method, 'bank_transfer'),
       'Übernommen aus Anzahlungsfeld', i.deposit_paid_at
FROM   invoices i
WHERE  i.deposit_paid_amount IS NOT NULL
  AND  i.deposit_paid_amount > 0
  AND  i.deposit_paid_at IS NOT NULL
  AND  NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id);


-- ── Convenience view: every payment that applies to an invoice ───────────────
-- An invoice shows its own payments plus the ones recorded on its reservation
-- (a deposit taken at booking time, before any invoice existed).
CREATE OR REPLACE VIEW invoice_payments AS
SELECT i.id AS invoice_id, p.*
FROM   invoices i
JOIN   payments p
       ON p.invoice_id = i.id
       OR (p.invoice_id IS NULL AND p.reservation_id = i.reservation_id);
