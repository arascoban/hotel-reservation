-- Migration: 026_remove_connecting_rooms.sql
-- Remove the combined-room entries added in migration 021.
-- Individual rooms 11, 12, 19, 20, 21, 22 remain untouched.
-- The family_connecting room_type_category is left in place (no harm).
DELETE FROM rooms WHERE room_number IN ('11+12', '19+20', '21+22');
