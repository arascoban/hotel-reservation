-- Migration: 021_family_connecting_rooms.sql
-- Add 'family_connecting' room type for rooms with connecting door (Verbindungstür)
-- Pairs: 11+12, 19+20, 21+22

-- 1. Add new ENUM value (PostgreSQL allows this outside a transaction)
ALTER TYPE room_type_category ADD VALUE IF NOT EXISTS 'family_connecting';

-- 2. Add room type record (after ENUM value is committed)
INSERT INTO room_types (id, category, name, base_capacity, max_capacity, sort_order)
VALUES (
  gen_random_uuid(),
  'family_connecting',
  'Familienzimmer mit Verbindungstür',
  3,
  5,
  6
)
ON CONFLICT (category) DO NOTHING;

-- 3. Add the three connecting-door room pairs
INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), rt.id, '11+12', 'Zimmer 11+12', 2, 28, true
FROM room_types rt WHERE rt.category = 'family_connecting'
ON CONFLICT (room_number) DO NOTHING;

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), rt.id, '19+20', 'Zimmer 19+20', 2, 29, true
FROM room_types rt WHERE rt.category = 'family_connecting'
ON CONFLICT (room_number) DO NOTHING;

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), rt.id, '21+22', 'Zimmer 21+22', 3, 34, true
FROM room_types rt WHERE rt.category = 'family_connecting'
ON CONFLICT (room_number) DO NOTHING;
