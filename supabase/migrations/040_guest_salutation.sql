-- Migration: 040_guest_salutation.sql
-- Anrede (Herr / Frau) for guests, so e-mails can open with
-- "Sehr geehrter Herr …" / "Sehr geehrte Frau …".
--
-- Invoices already carry a `salutation` column (028_invoice_salutation.sql).
-- Reservations and customers get the exact same column name and the same
-- values ('Herr' | 'Frau' | NULL) so every surface reads it the same way.

ALTER TABLE customers    ADD COLUMN IF NOT EXISTS salutation TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS salutation TEXT;

-- ── Backfill from what has already been typed ─────────────────────────────────
-- An invoice is written for a reservation, so its Anrede belongs to the same
-- person. Only fill blanks — never overwrite.
UPDATE reservations r
SET    salutation = i.salutation
FROM   invoices i
WHERE  i.reservation_id = r.id
  AND  i.salutation IS NOT NULL
  AND  r.salutation IS NULL;

UPDATE customers c
SET    salutation = r.salutation
FROM   reservations r
WHERE  r.customer_id = c.id
  AND  r.salutation IS NOT NULL
  AND  c.salutation IS NULL;
