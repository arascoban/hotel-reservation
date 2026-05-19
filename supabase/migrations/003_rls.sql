-- ============================================================
-- Hotel Reservation System — Row Level Security
-- Migration: 003_rls.sql
--
-- Policy: Only authenticated users (hotel staff) can access
-- any data. No public access.
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE room_types                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_feeds                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_rooms                ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookable_unit_physical_rooms  ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------
-- room_types: authenticated users can read; admins write
-- For MVP, all authenticated users have full access.
-- -------------------------------------------------------
CREATE POLICY "staff can read room_types"
  ON room_types FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "staff can manage room_types"
  ON room_types FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- -------------------------------------------------------
-- rooms
-- -------------------------------------------------------
CREATE POLICY "staff can read rooms"
  ON rooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "staff can manage rooms"
  ON rooms FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- -------------------------------------------------------
-- guests
-- -------------------------------------------------------
CREATE POLICY "staff can read guests"
  ON guests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "staff can manage guests"
  ON guests FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- -------------------------------------------------------
-- reservations
-- -------------------------------------------------------
CREATE POLICY "staff can read reservations"
  ON reservations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "staff can manage reservations"
  ON reservations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- -------------------------------------------------------
-- sync_feeds
-- -------------------------------------------------------
CREATE POLICY "staff can read sync_feeds"
  ON sync_feeds FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "staff can manage sync_feeds"
  ON sync_feeds FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- -------------------------------------------------------
-- sync_logs (read-only for staff; written by server)
-- -------------------------------------------------------
CREATE POLICY "staff can read sync_logs"
  ON sync_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "staff can manage sync_logs"
  ON sync_logs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- -------------------------------------------------------
-- physical_rooms + mapping (future)
-- -------------------------------------------------------
CREATE POLICY "staff can manage physical_rooms"
  ON physical_rooms FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "staff can manage bookable_unit_physical_rooms"
  ON bookable_unit_physical_rooms FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- Grant execute permissions on RPC functions to authenticated
-- ============================================================
GRANT EXECUTE ON FUNCTION check_room_availability TO authenticated;
GRANT EXECUTE ON FUNCTION create_reservation TO authenticated;
GRANT EXECUTE ON FUNCTION update_reservation TO authenticated;
GRANT EXECUTE ON FUNCTION get_available_rooms TO authenticated;
GRANT EXECUTE ON FUNCTION get_calendar_reservations TO authenticated;
