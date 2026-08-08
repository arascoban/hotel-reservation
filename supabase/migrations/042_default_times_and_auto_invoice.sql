-- Migration: 042_default_times_and_auto_invoice.sql
--
-- 1. Default check-in / check-out times, editable under Einstellungen.
-- 2. Link an invoice to the whole booking it was generated from, so the
--    Reservierungen page can tell which booking already has one.

-- ── Default arrival / departure times ────────────────────────────────────────
-- invoice_settings is the app's single settings row (it already holds
-- default_deposit_percent); keeping one row avoids a second settings table.
ALTER TABLE invoice_settings
  ADD COLUMN IF NOT EXISTS default_checkin_time  TEXT NOT NULL DEFAULT '13:00',
  ADD COLUMN IF NOT EXISTS default_checkout_time TEXT NOT NULL DEFAULT '12:00';

-- ── Invoice ↔ booking link ───────────────────────────────────────────────────
-- invoices.reservation_id points at the row the invoice was created from.
-- A group or family booking spans several rows, so also remember the booking
-- itself: without it, opening the invoice from another room of the same group
-- would look like there is none and a second invoice would be issued.
-- 036 already added group_booking_id; family bookings need the same.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS family_booking_id UUID;

CREATE INDEX IF NOT EXISTS idx_invoices_reservation ON invoices (reservation_id)
  WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_group ON invoices (group_booking_id)
  WHERE group_booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_family ON invoices (family_booking_id)
  WHERE family_booking_id IS NOT NULL;

-- Backfill the link for invoices that were created from a family booking.
UPDATE invoices i
SET    family_booking_id = r.family_booking_id
FROM   reservations r
WHERE  r.id = i.reservation_id
  AND  r.family_booking_id IS NOT NULL
  AND  i.family_booking_id IS NULL;
