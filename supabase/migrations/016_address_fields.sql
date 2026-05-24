-- Add structured address fields to reservations
-- Replaces the free-form billing_address text field with 4 structured columns.
-- billing_address is kept for backward compatibility.

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS guest_street   TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS guest_postcode TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS guest_city     TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS guest_country  TEXT;

-- Backfill: if billing_address exists, treat first line as street
-- (safe no-op if already null)
UPDATE reservations
SET guest_street = split_part(billing_address, E'\n', 1)
WHERE billing_address IS NOT NULL
  AND guest_street IS NULL;
