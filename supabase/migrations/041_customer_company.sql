-- Migration: 041_customer_company.sql
-- Split the customer name into Vor-/Nachname and add the company a guest
-- books for, so a booking confirmation or an invoice can be addressed either
-- to the person or to the company.
--
-- `customers.name` stays the canonical full name — every reservation, invoice
-- and e-mail already reads it — and is kept in sync as "Vorname Nachname".

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS first_name       TEXT,
  ADD COLUMN IF NOT EXISTS last_name        TEXT,
  ADD COLUMN IF NOT EXISTS company_name     TEXT,
  ADD COLUMN IF NOT EXISTS vat_id           TEXT,
  ADD COLUMN IF NOT EXISTS company_street   TEXT,
  ADD COLUMN IF NOT EXISTS company_postcode TEXT,
  ADD COLUMN IF NOT EXISTS company_city     TEXT,
  ADD COLUMN IF NOT EXISTS company_country  TEXT;

-- Split what is already there: the last token is the surname, the rest the
-- given name(s). A single-word name becomes the surname, which is what the
-- salutation ("Sehr geehrter Herr …") already assumes.
UPDATE customers
SET    first_name = NULLIF(regexp_replace(regexp_replace(btrim(name), '\s*\S+$', ''), '\s+', ' ', 'g'), ''),
       last_name  = NULLIF((regexp_match(btrim(name), '(\S+)$'))[1], '')
WHERE  first_name IS NULL
  AND  last_name  IS NULL
  AND  btrim(COALESCE(name, '')) <> '';

-- ── Who the document is addressed to ─────────────────────────────────────────
-- 'person' (default) or 'company'. NULL means person, so nothing changes for
-- the bookings that already exist.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS bill_to TEXT;

-- An invoice must never change after it was issued, so it snapshots the
-- company details instead of reading them back from the customer record.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS bill_to      TEXT,
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS vat_id       TEXT;
