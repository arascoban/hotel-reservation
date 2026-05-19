-- ============================================================
-- Hotel Reservation System — Seed Data
-- seed.sql
--
-- Inserts:
--   - 5 room types
--   - 13 sellable room units
--
-- Run AFTER all migrations have been applied.
-- ============================================================


-- ============================================================
-- ROOM TYPES
-- sort_order controls the calendar grouping display order
-- ============================================================

INSERT INTO room_types (id, category, name, base_capacity, max_capacity, sort_order, description)
VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    'single',
    'Single Room',
    1, 1,
    10,
    'Single occupancy room with one single bed. Suitable for solo travelers.'
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    'double',
    'Double Room',
    2, 2,
    20,
    'Standard double room with one double bed. Suitable for couples or two guests.'
  ),
  (
    'a1000000-0000-0000-0000-000000000003',
    'double_sofa',
    'Double Room with Sofa Bed',
    2, 3,
    30,
    'Double room with a sofa bed. Normal capacity 2, maximum capacity 3 guests.'
  ),
  (
    'a1000000-0000-0000-0000-000000000004',
    'family_double',
    'Family Room (Connecting Door + Double Bed)',
    4, 4,
    40,
    'Family unit consisting of two connected rooms. Second room has a double bed. Capacity 4 guests.'
  ),
  (
    'a1000000-0000-0000-0000-000000000005',
    'family_single',
    'Family Room (Connecting Door + Single Bed)',
    3, 3,
    50,
    'Family unit consisting of two connected rooms. Second room has a single bed. Capacity 3 guests.'
  )
ON CONFLICT (category) DO UPDATE SET
  name          = EXCLUDED.name,
  base_capacity = EXCLUDED.base_capacity,
  max_capacity  = EXCLUDED.max_capacity,
  sort_order    = EXCLUDED.sort_order,
  description   = EXCLUDED.description;


-- ============================================================
-- ROOMS — 13 Sellable Units
--
-- Numbering scheme:
--   1xx — Single Rooms
--   2xx — Double Rooms
--   3xx — Double Rooms with Sofa Bed
--   4xx — Family Rooms
--
-- sort_order within a type controls calendar row order.
-- ============================================================

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order)
VALUES

  -- Single Rooms (2 units)
  (
    'b1000000-0000-0000-0000-000000000101',
    'a1000000-0000-0000-0000-000000000001',
    '101', 'Room 101 — Single', 1, 10
  ),
  (
    'b1000000-0000-0000-0000-000000000102',
    'a1000000-0000-0000-0000-000000000001',
    '102', 'Room 102 — Single', 1, 20
  ),

  -- Double Rooms (4 units)
  (
    'b1000000-0000-0000-0000-000000000201',
    'a1000000-0000-0000-0000-000000000002',
    '201', 'Room 201 — Double', 2, 10
  ),
  (
    'b1000000-0000-0000-0000-000000000202',
    'a1000000-0000-0000-0000-000000000002',
    '202', 'Room 202 — Double', 2, 20
  ),
  (
    'b1000000-0000-0000-0000-000000000203',
    'a1000000-0000-0000-0000-000000000002',
    '203', 'Room 203 — Double', 2, 30
  ),
  (
    'b1000000-0000-0000-0000-000000000204',
    'a1000000-0000-0000-0000-000000000002',
    '204', 'Room 204 — Double', 2, 40
  ),

  -- Double Rooms with Sofa Bed (4 units)
  (
    'b1000000-0000-0000-0000-000000000301',
    'a1000000-0000-0000-0000-000000000003',
    '301', 'Room 301 — Double + Sofa', 3, 10
  ),
  (
    'b1000000-0000-0000-0000-000000000302',
    'a1000000-0000-0000-0000-000000000003',
    '302', 'Room 302 — Double + Sofa', 3, 20
  ),
  (
    'b1000000-0000-0000-0000-000000000303',
    'a1000000-0000-0000-0000-000000000003',
    '303', 'Room 303 — Double + Sofa', 3, 30
  ),
  (
    'b1000000-0000-0000-0000-000000000304',
    'a1000000-0000-0000-0000-000000000003',
    '304', 'Room 304 — Double + Sofa', 3, 40
  ),

  -- Family Rooms with Connecting Door + Double Bed (2 units)
  (
    'b1000000-0000-0000-0000-000000000401',
    'a1000000-0000-0000-0000-000000000004',
    'F1', 'Suite F1 — Family (Double)', 4, 10
  ),
  (
    'b1000000-0000-0000-0000-000000000402',
    'a1000000-0000-0000-0000-000000000004',
    'F2', 'Suite F2 — Family (Double)', 4, 20
  ),

  -- Family Room with Connecting Door + Single Bed (1 unit)
  (
    'b1000000-0000-0000-0000-000000000403',
    'a1000000-0000-0000-0000-000000000005',
    'F3', 'Suite F3 — Family (Single)', 4, 30
  )

ON CONFLICT (room_number) DO UPDATE SET
  name       = EXCLUDED.name,
  floor      = EXCLUDED.floor,
  sort_order = EXCLUDED.sort_order;


-- ============================================================
-- VERIFICATION QUERY
-- Run this after seeding to confirm 13 rooms across 5 types.
-- ============================================================
/*
SELECT
  rt.name         AS room_type,
  rt.category,
  rt.max_capacity,
  COUNT(r.id)     AS room_count
FROM room_types rt
LEFT JOIN rooms r ON r.room_type_id = rt.id AND r.is_active = TRUE
GROUP BY rt.id, rt.name, rt.category, rt.max_capacity, rt.sort_order
ORDER BY rt.sort_order;

Expected result:
  Single Room                              | single        | 1 | 2
  Double Room                              | double        | 2 | 4
  Double Room with Sofa Bed               | double_sofa   | 3 | 4
  Family Room (Connecting Door + Double)  | family_double | 4 | 2
  Family Room (Connecting Door + Single)  | family_single | 3 | 1
  ─────────────────────────────────────────────────────────────
  Total: 13 rooms
*/
