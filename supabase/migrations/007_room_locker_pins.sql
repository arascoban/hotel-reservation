-- ============================================================
-- Migration: 007_room_locker_pins.sql
-- Every room has its own locker — store PIN directly on rooms.
-- Also update get_available_rooms to exclude maintenance rooms.
-- ============================================================

-- Add locker_pin column to rooms (every room gets its own locker)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS locker_pin TEXT NOT NULL DEFAULT '0000';

-- ============================================================
-- Update get_available_rooms to exclude rooms in maintenance.
-- Rooms with cleaning_status = 'maintenance' cannot be booked.
-- ============================================================

DROP FUNCTION IF EXISTS get_available_rooms(TIMESTAMPTZ, TIMESTAMPTZ, INT, UUID);

CREATE OR REPLACE FUNCTION get_available_rooms(
  p_checkin_at   TIMESTAMPTZ,
  p_checkout_at  TIMESTAMPTZ,
  p_guest_count  INT  DEFAULT 1,
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
    r.is_active = TRUE
    -- Exclude rooms under maintenance — they cannot be booked
    AND r.cleaning_status != 'maintenance'
    -- Guest count must not exceed this room's maximum capacity
    AND p_guest_count <= rt.max_capacity
    -- Room must have no conflicting active reservations
    AND NOT EXISTS (
      SELECT 1
      FROM reservations res
      WHERE
        res.room_id = r.id
        AND res.status NOT IN ('cancelled', 'no_show')
        AND res.deleted_at IS NULL
        AND (p_exclude_id IS NULL OR res.id != p_exclude_id)
        AND res.checkin_at  < p_checkout_at
        AND res.checkout_at > p_checkin_at
    )
  ORDER BY rt.sort_order, r.sort_order;
END;
$$;
