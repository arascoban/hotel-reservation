-- Migration: 038_room_type_capacity.sql
-- Separate adult / child limits per room type, and drop the two family room
-- types that never had any rooms.
--
-- Until now a room type only carried max_capacity ("max. 3 Personen"), which
-- cannot express "2 adults plus 2 children, but never more than 3 people in
-- total". Three values do:
--   max_adults    — how many adults fit
--   max_children  — how many children fit
--   max_capacity  — the hard ceiling for both combined (unchanged)

ALTER TABLE room_types
  ADD COLUMN IF NOT EXISTS max_adults   INT,
  ADD COLUMN IF NOT EXISTS max_children INT;

-- Seed from what the type already knows: every existing bed counts as an
-- adult place, and a type that can take more than its base occupancy has room
-- for that many children on top.
UPDATE room_types
SET    max_adults   = COALESCE(max_adults, base_capacity),
       max_children = COALESCE(max_children, GREATEST(max_capacity - base_capacity, 0))
WHERE  max_adults IS NULL OR max_children IS NULL;

ALTER TABLE room_types ALTER COLUMN max_adults   SET DEFAULT 2;
ALTER TABLE room_types ALTER COLUMN max_children SET DEFAULT 0;

ALTER TABLE room_types DROP CONSTRAINT IF EXISTS room_types_occupancy_check;
ALTER TABLE room_types
  ADD CONSTRAINT room_types_occupancy_check
  CHECK (
    max_adults   IS NULL OR max_adults   >= 1
  ) NOT VALID;


-- ── Remove the unused family room types ──────────────────────────────────────
-- 'family_double' and 'family_single' come from the original seed and never
-- received a room: the hotel's family units are the connecting-door pairs
-- (11+12, 19+20, 21+22), which use 'family_connecting'. Keeping them only
-- added two rows to the price list that can never apply.
--
-- Guarded: a type is only removed when nothing references it, so this can
-- never delete a type that turns out to be in use.
DELETE FROM room_types rt
WHERE  rt.category IN ('family_double', 'family_single')
  AND  NOT EXISTS (SELECT 1 FROM rooms r WHERE r.room_type_id = rt.id);

-- ── Sensible occupancy for the types that remain ─────────────────────────────
UPDATE room_types SET max_adults = 1, max_children = 0 WHERE category = 'single'      AND max_adults IS NULL;
UPDATE room_types SET max_adults = 2, max_children = 0 WHERE category = 'double'      AND max_adults IS NULL;
UPDATE room_types SET max_adults = 2, max_children = 1 WHERE category = 'double_sofa' AND max_adults IS NULL;
UPDATE room_types SET max_adults = 4, max_children = 2 WHERE category = 'family_connecting' AND max_adults IS NULL;

-- ── New sidebar entry ────────────────────────────────────────────────────────
INSERT INTO menu_visibility (menu_key, label, sort_order)
VALUES ('reservations', 'Reservierungen', 25)
ON CONFLICT (menu_key) DO NOTHING;

UPDATE menu_visibility SET label = 'Kalender' WHERE menu_key = 'calendar';
