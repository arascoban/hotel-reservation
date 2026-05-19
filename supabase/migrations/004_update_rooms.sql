-- Update room type names to German
UPDATE room_types SET name = 'Einzelzimmer'              WHERE category = 'single';
UPDATE room_types SET name = 'Doppelzimmer'              WHERE category = 'double';
UPDATE room_types SET name = 'Doppelzimmer mit Schlafsofa' WHERE category = 'double_sofa';
UPDATE room_types SET name = 'Familienzimmer (Doppel)'   WHERE category = 'family_double';
UPDATE room_types SET name = 'Familienzimmer (Einzel)'   WHERE category = 'family_single';

-- Clear existing rooms (safe on fresh install; re-run seed after)
DELETE FROM reservations;
DELETE FROM sync_feeds;
DELETE FROM rooms;

-- Re-insert rooms with correct layout
-- Floor 1
INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '101', 'Zimmer 101', 1, 10, true FROM room_types WHERE category = 'double_sofa';

-- Floor 2
INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '201', 'Zimmer 201', 2, 20, true FROM room_types WHERE category = 'family_double';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '202', 'Zimmer 202', 2, 21, true FROM room_types WHERE category = 'double';

-- Floor 3
INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '301', 'Zimmer 301', 3, 30, true FROM room_types WHERE category = 'double';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '302', 'Zimmer 302', 3, 31, true FROM room_types WHERE category = 'double';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '303', 'Zimmer 303', 3, 32, true FROM room_types WHERE category = 'double';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '304', 'Zimmer 304', 3, 33, true FROM room_types WHERE category = 'double_sofa';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '305', 'Zimmer 305', 3, 34, true FROM room_types WHERE category = 'family_double';

-- Floor 4
INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '401', 'Zimmer 401', 4, 40, true FROM room_types WHERE category = 'single';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '402', 'Zimmer 402', 4, 41, true FROM room_types WHERE category = 'single';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '403', 'Zimmer 403', 4, 42, true FROM room_types WHERE category = 'family_single';

-- Pension (separate building)
INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, 'P1', 'Pension P1', null, 50, true FROM room_types WHERE category = 'double_sofa';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, 'P2', 'Pension P2', null, 51, true FROM room_types WHERE category = 'double_sofa';
