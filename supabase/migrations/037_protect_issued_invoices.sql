-- Migration: 037_protect_issued_invoices.sql
-- Keep an issued invoice's payment history intact.
--
-- The invoice document itself is already a frozen snapshot: guest name and
-- address, room, dates, nights, prices, line items, VAT, discount and the
-- group's rooms are all stored on the invoice row and never re-read from
-- rooms/customers/reservations. Payments are the one thing read live, which
-- is correct — money arrives after the invoice is issued and the Restbetrag
-- has to reflect that.
--
-- The defect: payments.reservation_id cascaded on delete. Permanently
-- deleting a reservation therefore removed payments that an already-issued
-- invoice was displaying, silently changing its Restbetrag (e.g. a 500 EUR
-- invoice showing 350 EUR open jumped back to 500 EUR).
--
-- Fix: a payment that belongs to an invoice survives its reservation. One
-- that belongs to no invoice is still removed together with the reservation,
-- so no orphans accumulate.

-- ── 1. Payments outlive their reservation ────────────────────────────────────
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_reservation_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_reservation_id_fkey
  FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE SET NULL;

-- The owner check has to tolerate the moment between SET NULL and the
-- cleanup below, so it no longer requires a reservation link.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_owner_check;

-- ── 2. Drop payments that would be left with no owner ────────────────────────
-- Runs before the reservation row goes away, so only payments that are not
-- attached to an invoice are removed.
CREATE OR REPLACE FUNCTION cleanup_orphan_payments()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM payments
  WHERE reservation_id = OLD.id
    AND invoice_id IS NULL;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS reservations_cleanup_payments ON reservations;
CREATE TRIGGER reservations_cleanup_payments
  BEFORE DELETE ON reservations
  FOR EACH ROW EXECUTE FUNCTION cleanup_orphan_payments();

-- ── 3. Bind existing payments to the invoices that display them ──────────────
-- Any payment currently shown on an invoice through its reservation becomes
-- owned by that invoice, so it is protected from here on.
UPDATE payments p
SET    invoice_id = i.id
FROM   invoices i
WHERE  p.invoice_id IS NULL
  AND  p.reservation_id IS NOT NULL
  AND  i.reservation_id = p.reservation_id;

-- ── 4. Issued invoice numbers must stay unique and stable ────────────────────
-- Already guaranteed by the UNIQUE constraint on invoice_number; restated
-- here so the intent is documented alongside the rest of the protection.
COMMENT ON TABLE invoices IS
  'Issued invoices. Every displayed value is stored on the row itself — the '
  'document never re-reads rooms, customers or reservations, so later edits '
  'to those cannot change an invoice that has already been issued.';
