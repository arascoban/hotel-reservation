-- Migration: 036_group_bookings.sql
-- Group bookings: one customer, several rooms, a single confirmation and a
-- single invoice — while each room is still blocked individually in the
-- calendar.
--
-- Each room remains its own row in `reservations` (the EXCLUDE constraint and
-- the calendar both work per room); the rows are tied together by a shared
-- group_booking_id. This mirrors how family bookings already work, but is a
-- separate column: a family booking means "two connected rooms sold as one
-- unit", a group means "N independent rooms billed together".

-- ── Base price per room type (breakfast included) ────────────────────────────
ALTER TABLE room_types
  ADD COLUMN IF NOT EXISTS base_price NUMERIC(10,2);

COMMENT ON COLUMN room_types.base_price IS
  'Standard price per night, breakfast included. Pre-fills group bookings.';

-- ── Group link on reservations ───────────────────────────────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS group_booking_id UUID;

CREATE INDEX IF NOT EXISTS idx_reservations_group
  ON reservations (group_booking_id)
  WHERE group_booking_id IS NOT NULL;

-- ── Group rooms on invoices ──────────────────────────────────────────────────
-- The invoice already carries room_number/room2_* for one or two rooms. A
-- group can hold any number, so its rooms live in one JSONB array:
--   [{ room_number, room_name, checkin_at, checkout_at, nights,
--      adults, children, price }]
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS group_rooms      JSONB,
  ADD COLUMN IF NOT EXISTS group_booking_id UUID;

CREATE INDEX IF NOT EXISTS idx_invoices_group
  ON invoices (group_booking_id)
  WHERE group_booking_id IS NOT NULL;

-- ── Seed sensible starting prices ────────────────────────────────────────────
-- Only fills types that have no price yet, so re-running never overwrites
-- what the hotel has configured.
UPDATE room_types SET base_price = 60 WHERE base_price IS NULL AND category = 'single';
UPDATE room_types SET base_price = 80 WHERE base_price IS NULL AND category = 'double';
UPDATE room_types SET base_price = 95 WHERE base_price IS NULL AND category = 'double_sofa';
UPDATE room_types SET base_price = 140 WHERE base_price IS NULL AND category IN ('family_double', 'family_connecting');
UPDATE room_types SET base_price = 120 WHERE base_price IS NULL AND category = 'family_single';
