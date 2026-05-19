-- ============================================================
-- Hotel Reservation System — RPC Functions
-- Migration: 002_functions.sql
-- ============================================================


-- ============================================================
-- FUNCTION: check_room_availability
--
-- Returns TRUE if a room is available for the given period.
-- Excludes cancelled and no-show reservations.
-- Optionally excludes a specific reservation ID (for edits).
--
-- Usage:
--   SELECT check_room_availability(
--     'room-uuid',
--     '2026-05-19 15:00:00+02',
--     '2026-05-22 11:00:00+02',
--     NULL  -- or existing reservation UUID when editing
--   );
-- ============================================================

CREATE OR REPLACE FUNCTION check_room_availability(
  p_room_id        UUID,
  p_checkin_at     TIMESTAMPTZ,
  p_checkout_at    TIMESTAMPTZ,
  p_exclude_id     UUID DEFAULT NULL  -- exclude this reservation (for updates)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  conflict_count INT;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM reservations
  WHERE
    room_id = p_room_id
    AND status NOT IN ('cancelled', 'no_show')
    AND (p_exclude_id IS NULL OR id != p_exclude_id)
    -- Overlap condition: new range overlaps existing range
    AND checkin_at  < p_checkout_at
    AND checkout_at > p_checkin_at;

  RETURN conflict_count = 0;
END;
$$;


-- ============================================================
-- FUNCTION: create_reservation
--
-- Safely creates a reservation in a single transaction.
-- Performs all validations before inserting:
--   1. Room exists and is active
--   2. Guest count does not exceed room max_capacity
--   3. No overlapping reservations (belt-and-suspenders check
--      on top of the EXCLUDE constraint)
--
-- Creates or reuses a guest profile based on email.
-- If no email is provided, always creates a new guest row.
--
-- Returns the new reservation ID on success.
-- Raises an exception with a descriptive message on failure.
-- ============================================================

CREATE OR REPLACE FUNCTION create_reservation(
  -- Required params (no defaults) must come first
  p_guest_name        TEXT,
  p_room_id           UUID,
  p_checkin_at        TIMESTAMPTZ,
  p_checkout_at       TIMESTAMPTZ,

  -- Optional params (with defaults)
  p_guest_email       TEXT DEFAULT NULL,
  p_guest_phone       TEXT DEFAULT NULL,
  p_guest_count       INT DEFAULT 1,
  p_breakfast         BOOLEAN DEFAULT FALSE,
  p_source            reservation_source DEFAULT 'other',
  p_payment_method    payment_method_type DEFAULT 'unpaid',
  p_payment_status    payment_status_type DEFAULT 'unpaid',
  p_status            reservation_status_type DEFAULT 'confirmed',
  p_total_price       NUMERIC DEFAULT NULL,
  p_notes             TEXT DEFAULT NULL,
  p_external_id       TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_room            RECORD;
  v_room_type       RECORD;
  v_guest_id        UUID;
  v_reservation_id  UUID;
BEGIN
  -- ----------------------------------------------------------
  -- 1. Validate dates
  -- ----------------------------------------------------------
  IF p_checkout_at <= p_checkin_at THEN
    RAISE EXCEPTION 'checkout_at must be after checkin_at'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ----------------------------------------------------------
  -- 2. Load room and room type
  -- ----------------------------------------------------------
  SELECT r.*, rt.max_capacity, rt.base_capacity, rt.category
  INTO v_room
  FROM rooms r
  JOIN room_types rt ON rt.id = r.room_type_id
  WHERE r.id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found: %', p_room_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT v_room.is_active THEN
    RAISE EXCEPTION 'Room % is not currently active', v_room.room_number
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ----------------------------------------------------------
  -- 3. Validate guest count against room capacity
  -- ----------------------------------------------------------
  IF p_guest_count < 1 THEN
    RAISE EXCEPTION 'Guest count must be at least 1'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_guest_count > v_room.max_capacity THEN
    RAISE EXCEPTION 'Guest count (%) exceeds maximum capacity (%) for this room type',
      p_guest_count, v_room.max_capacity
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ----------------------------------------------------------
  -- 4. Check availability (explicit check before constraint)
  --    This gives a cleaner error message than the constraint.
  -- ----------------------------------------------------------
  IF NOT check_room_availability(p_room_id, p_checkin_at, p_checkout_at) THEN
    RAISE EXCEPTION 'This room is already occupied for the selected dates'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  -- ----------------------------------------------------------
  -- 5. Upsert guest record
  --    If an email is provided, reuse the existing guest profile.
  --    Otherwise, create a new guest row each time.
  -- ----------------------------------------------------------
  IF p_guest_email IS NOT NULL AND p_guest_email != '' THEN
    SELECT id INTO v_guest_id
    FROM guests
    WHERE email = p_guest_email
    LIMIT 1;

    IF v_guest_id IS NULL THEN
      INSERT INTO guests (full_name, email, phone)
      VALUES (p_guest_name, p_guest_email, p_guest_phone)
      RETURNING id INTO v_guest_id;
    ELSE
      -- Update name/phone in case they changed
      UPDATE guests
      SET full_name = p_guest_name,
          phone     = COALESCE(p_guest_phone, phone)
      WHERE id = v_guest_id;
    END IF;
  ELSE
    INSERT INTO guests (full_name, email, phone)
    VALUES (p_guest_name, p_guest_email, p_guest_phone)
    RETURNING id INTO v_guest_id;
  END IF;

  -- ----------------------------------------------------------
  -- 6. Insert reservation
  --    The EXCLUDE constraint is the final safety net.
  -- ----------------------------------------------------------
  INSERT INTO reservations (
    room_id,
    guest_id,
    guest_name,
    guest_email,
    guest_phone,
    checkin_at,
    checkout_at,
    guest_count,
    breakfast_included,
    source,
    payment_method,
    payment_status,
    status,
    total_price,
    notes,
    external_id
  ) VALUES (
    p_room_id,
    v_guest_id,
    p_guest_name,
    p_guest_email,
    p_guest_phone,
    p_checkin_at,
    p_checkout_at,
    p_guest_count,
    p_breakfast,
    p_source,
    p_payment_method,
    p_payment_status,
    p_status,
    p_total_price,
    p_notes,
    p_external_id
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;

EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'This room is already occupied for the selected dates'
      USING ERRCODE = 'exclusion_violation';
END;
$$;


-- ============================================================
-- FUNCTION: update_reservation
--
-- Safely updates an existing reservation.
-- Re-checks availability excluding the reservation being
-- updated (so editing dates on the same reservation works).
-- ============================================================

CREATE OR REPLACE FUNCTION update_reservation(
  p_reservation_id    UUID,

  -- Guest info (all optional — NULL means keep existing)
  p_guest_name        TEXT DEFAULT NULL,
  p_guest_email       TEXT DEFAULT NULL,
  p_guest_phone       TEXT DEFAULT NULL,

  -- Room & dates (all optional)
  p_room_id           UUID DEFAULT NULL,
  p_checkin_at        TIMESTAMPTZ DEFAULT NULL,
  p_checkout_at       TIMESTAMPTZ DEFAULT NULL,

  -- Stay details
  p_guest_count       INT DEFAULT NULL,
  p_breakfast         BOOLEAN DEFAULT NULL,

  -- Metadata
  p_source            reservation_source DEFAULT NULL,
  p_payment_method    payment_method_type DEFAULT NULL,
  p_payment_status    payment_status_type DEFAULT NULL,
  p_status            reservation_status_type DEFAULT NULL,
  p_total_price       NUMERIC DEFAULT NULL,
  p_notes             TEXT DEFAULT NULL,
  p_external_id       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing    RECORD;
  v_room        RECORD;
  v_new_room_id UUID;
  v_new_in      TIMESTAMPTZ;
  v_new_out     TIMESTAMPTZ;
  v_new_count   INT;
BEGIN
  -- Load existing reservation
  SELECT * INTO v_existing
  FROM reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found: %', p_reservation_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Resolve effective values (NULL = keep current)
  v_new_room_id := COALESCE(p_room_id, v_existing.room_id);
  v_new_in      := COALESCE(p_checkin_at, v_existing.checkin_at);
  v_new_out     := COALESCE(p_checkout_at, v_existing.checkout_at);
  v_new_count   := COALESCE(p_guest_count, v_existing.guest_count);

  -- Validate dates
  IF v_new_out <= v_new_in THEN
    RAISE EXCEPTION 'checkout_at must be after checkin_at'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Load room type for capacity check
  SELECT r.is_active, rt.max_capacity
  INTO v_room
  FROM rooms r
  JOIN room_types rt ON rt.id = r.room_type_id
  WHERE r.id = v_new_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Room not found: %', v_new_room_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT v_room.is_active THEN
    RAISE EXCEPTION 'Selected room is not currently active'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_new_count > v_room.max_capacity THEN
    RAISE EXCEPTION 'Guest count (%) exceeds maximum capacity (%)',
      v_new_count, v_room.max_capacity
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Only check availability if dates/room actually changed
  IF v_new_room_id != v_existing.room_id
     OR v_new_in    != v_existing.checkin_at
     OR v_new_out   != v_existing.checkout_at
  THEN
    IF NOT check_room_availability(v_new_room_id, v_new_in, v_new_out, p_reservation_id) THEN
      RAISE EXCEPTION 'This room is already occupied for the selected dates'
        USING ERRCODE = 'exclusion_violation';
    END IF;
  END IF;

  -- Perform the update (only set columns where a value was provided)
  UPDATE reservations SET
    room_id            = v_new_room_id,
    guest_name         = COALESCE(p_guest_name,     guest_name),
    guest_email        = COALESCE(p_guest_email,    guest_email),
    guest_phone        = COALESCE(p_guest_phone,    guest_phone),
    checkin_at         = v_new_in,
    checkout_at        = v_new_out,
    guest_count        = v_new_count,
    breakfast_included = COALESCE(p_breakfast,      breakfast_included),
    source             = COALESCE(p_source,         source),
    payment_method     = COALESCE(p_payment_method, payment_method),
    payment_status     = COALESCE(p_payment_status, payment_status),
    status             = COALESCE(p_status,         status),
    total_price        = COALESCE(p_total_price,    total_price),
    notes              = COALESCE(p_notes,          notes),
    external_id        = COALESCE(p_external_id,    external_id)
  WHERE id = p_reservation_id;

EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'This room is already occupied for the selected dates'
      USING ERRCODE = 'exclusion_violation';
END;
$$;


-- ============================================================
-- FUNCTION: get_available_rooms
--
-- Returns rooms that are available for the given date range
-- and can accommodate the given guest count.
-- Used by the Add Reservation form to populate room dropdown.
-- ============================================================

CREATE OR REPLACE FUNCTION get_available_rooms(
  p_checkin_at   TIMESTAMPTZ,
  p_checkout_at  TIMESTAMPTZ,
  p_guest_count  INT DEFAULT 1,
  p_exclude_id   UUID DEFAULT NULL  -- exclude current reservation when editing
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
    -- Guest count must not exceed this room's maximum capacity
    AND p_guest_count <= rt.max_capacity
    -- Room must have no conflicting active reservations
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


-- ============================================================
-- FUNCTION: get_calendar_reservations
--
-- Returns all reservations in a given date window,
-- joined with room and room type data for the calendar view.
-- ============================================================

CREATE OR REPLACE FUNCTION get_calendar_reservations(
  p_from  DATE,
  p_to    DATE
)
RETURNS TABLE (
  id                  UUID,
  room_id             UUID,
  room_number         TEXT,
  room_name           TEXT,
  room_type_id        UUID,
  type_name           TEXT,
  category            room_type_category,
  type_sort_order     INT,
  room_sort_order     INT,
  guest_name          TEXT,
  guest_count         INT,
  checkin_at          TIMESTAMPTZ,
  checkout_at         TIMESTAMPTZ,
  status              reservation_status_type,
  source              reservation_source,
  payment_status      payment_status_type,
  breakfast_included  BOOLEAN,
  total_price         NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    res.id,
    r.id           AS room_id,
    r.room_number,
    r.name         AS room_name,
    rt.id          AS room_type_id,
    rt.name        AS type_name,
    rt.category,
    rt.sort_order  AS type_sort_order,
    r.sort_order   AS room_sort_order,
    res.guest_name,
    res.guest_count,
    res.checkin_at,
    res.checkout_at,
    res.status,
    res.source,
    res.payment_status,
    res.breakfast_included,
    res.total_price
  FROM reservations res
  JOIN rooms r ON r.id = res.room_id
  JOIN room_types rt ON rt.id = r.room_type_id
  WHERE
    -- Overlaps with the requested window
    res.checkin_at  < (p_to + INTERVAL '1 day')::TIMESTAMPTZ
    AND res.checkout_at > p_from::TIMESTAMPTZ
  ORDER BY rt.sort_order, r.sort_order, res.checkin_at;
$$;
