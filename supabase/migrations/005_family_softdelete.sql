-- ============================================================
-- Migration 005: Family booking link + soft delete
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Link two reservations created for one family room booking
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS family_booking_id UUID DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_family_booking
  ON reservations(family_booking_id) WHERE family_booking_id IS NOT NULL;

-- 2. Soft-delete: employees cannot see deleted, admin can
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_deleted
  ON reservations(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================
-- 3. Update check_room_availability
--    Soft-deleted reservations must NOT block availability
-- ============================================================
CREATE OR REPLACE FUNCTION check_room_availability(
  p_room_id     UUID,
  p_checkin_at  TIMESTAMPTZ,
  p_checkout_at TIMESTAMPTZ,
  p_exclude_id  UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
DECLARE conflict_count INT;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM reservations
  WHERE
    room_id      = p_room_id
    AND status  NOT IN ('cancelled', 'no_show')
    AND deleted_at IS NULL                       -- ignore soft-deleted
    AND (p_exclude_id IS NULL OR id != p_exclude_id)
    AND checkin_at  < p_checkout_at
    AND checkout_at > p_checkin_at;
  RETURN conflict_count = 0;
END;
$$;

-- ============================================================
-- 4. Update get_available_rooms
--    Soft-deleted reservations must NOT block a room
-- ============================================================
CREATE OR REPLACE FUNCTION get_available_rooms(
  p_checkin_at  TIMESTAMPTZ,
  p_checkout_at TIMESTAMPTZ,
  p_guest_count INT  DEFAULT 1,
  p_exclude_id  UUID DEFAULT NULL
)
RETURNS TABLE (
  id            UUID, room_number TEXT, name TEXT,
  floor         INT,  room_type_id UUID, type_name TEXT,
  category      room_type_category, base_capacity INT,
  max_capacity  INT,  sort_order INT
)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT r.id, r.room_number, r.name, r.floor, r.room_type_id,
         rt.name, rt.category, rt.base_capacity, rt.max_capacity, r.sort_order
  FROM rooms r
  JOIN room_types rt ON rt.id = r.room_type_id
  WHERE r.is_active = TRUE
    AND p_guest_count <= rt.max_capacity
    AND NOT EXISTS (
      SELECT 1 FROM reservations res
      WHERE res.room_id    = r.id
        AND res.status    NOT IN ('cancelled','no_show')
        AND res.deleted_at IS NULL               -- ignore soft-deleted
        AND (p_exclude_id IS NULL OR res.id != p_exclude_id)
        AND res.checkin_at  < p_checkout_at
        AND res.checkout_at > p_checkin_at
    )
  ORDER BY rt.sort_order, r.sort_order;
END;
$$;

-- ============================================================
-- 5. Update get_calendar_reservations
--    Return family_booking_id + deleted_at for client filtering
--    Must DROP first because the return type changes
-- ============================================================
DROP FUNCTION IF EXISTS get_calendar_reservations(date, date);

CREATE OR REPLACE FUNCTION get_calendar_reservations(
  p_from DATE,
  p_to   DATE
)
RETURNS TABLE (
  id                UUID, room_id UUID, room_number TEXT, room_name TEXT,
  room_type_id      UUID, type_name TEXT, category room_type_category,
  type_sort_order   INT,  room_sort_order INT, guest_name TEXT,
  guest_count       INT,  checkin_at TIMESTAMPTZ, checkout_at TIMESTAMPTZ,
  status            reservation_status_type, source reservation_source,
  payment_status    payment_status_type, breakfast_included BOOLEAN,
  total_price       NUMERIC, family_booking_id UUID, deleted_at TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT
    res.id, r.id, r.room_number, r.name,
    rt.id, rt.name, rt.category, rt.sort_order, r.sort_order,
    res.guest_name, res.guest_count, res.checkin_at, res.checkout_at,
    res.status, res.source, res.payment_status, res.breakfast_included,
    res.total_price, res.family_booking_id, res.deleted_at
  FROM reservations res
  JOIN rooms r  ON r.id  = res.room_id
  JOIN room_types rt ON rt.id = r.room_type_id
  WHERE res.checkin_at  < (p_to + INTERVAL '1 day')::TIMESTAMPTZ
    AND res.checkout_at > p_from::TIMESTAMPTZ
  ORDER BY rt.sort_order, r.sort_order, res.checkin_at;
$$;
