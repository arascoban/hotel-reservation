-- Migration: 027_rooms_billing_only.sql
-- Add billing_only flag so combined/virtual rooms are hidden from calendar and
-- the reservation form, but still selectable in the invoice modal.

-- 1. Add column (safe to run multiple times)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS billing_only BOOLEAN NOT NULL DEFAULT false;

-- 2. Re-insert the combined room entries that were removed in migration 026.
--    If they already exist (026 was never run) the ON CONFLICT clause just marks them billing_only.
INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active, billing_only)
SELECT gen_random_uuid(), rt.id, '11+12', 'Zimmer 11+12', 2, 28, true, true
FROM room_types rt WHERE rt.category = 'family_connecting'
ON CONFLICT (room_number) DO UPDATE SET billing_only = true;

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active, billing_only)
SELECT gen_random_uuid(), rt.id, '19+20', 'Zimmer 19+20', 2, 29, true, true
FROM room_types rt WHERE rt.category = 'family_connecting'
ON CONFLICT (room_number) DO UPDATE SET billing_only = true;

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active, billing_only)
SELECT gen_random_uuid(), rt.id, '21+22', 'Zimmer 21+22', 3, 34, true, true
FROM room_types rt WHERE rt.category = 'family_connecting'
ON CONFLICT (room_number) DO UPDATE SET billing_only = true;

-- 3. Update get_available_rooms to exclude billing_only rooms
--    (used by the reservation form — these virtual rooms can't be booked)
CREATE OR REPLACE FUNCTION get_available_rooms(
  p_checkin_at   TIMESTAMPTZ,
  p_checkout_at  TIMESTAMPTZ,
  p_guest_count  INT DEFAULT 1,
  p_exclude_id   UUID DEFAULT NULL
)
RETURNS TABLE (
  id             UUID,
  room_number    TEXT,
  name           TEXT,
  floor          INT,
  room_type_id   UUID,
  type_name      TEXT,
  category       room_type_category,
  base_capacity  INT,
  max_capacity   INT,
  sort_order     INT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.room_number,
    r.name,
    r.floor,
    r.room_type_id,
    rt.name    AS type_name,
    rt.category,
    rt.base_capacity,
    rt.max_capacity,
    r.sort_order
  FROM rooms r
  JOIN room_types rt ON rt.id = r.room_type_id
  WHERE
    r.is_active    = TRUE
    AND r.billing_only = FALSE
    AND p_guest_count <= rt.max_capacity
    AND NOT EXISTS (
      SELECT 1
      FROM reservations res
      WHERE
        res.room_id = r.id
        AND res.status NOT IN ('cancelled', 'no_show')
        AND (p_exclude_id IS NULL OR res.id != p_exclude_id)
        AND res.checkin_at  < p_checkout_at
        AND res.checkout_at > p_checkin_at
    )
  ORDER BY rt.sort_order, r.sort_order;
END;
$$;
