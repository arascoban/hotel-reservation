-- Update room type names to German
UPDATE room_types SET name = 'Einzelzimmer'                WHERE category = 'single';
UPDATE room_types SET name = 'Doppelzimmer'                WHERE category = 'double';
UPDATE room_types SET name = 'Doppelzimmer mit Schlafsofa' WHERE category = 'double_sofa';
UPDATE room_types SET name = 'Familienzimmer (Doppel)'     WHERE category = 'family_double';
UPDATE room_types SET name = 'Familienzimmer (Einzel)'     WHERE category = 'family_single';

-- Clear existing data (safe on fresh install)
DELETE FROM reservations;
DELETE FROM sync_feeds;
DELETE FROM rooms;

-- ── Doppelzimmer mit Schlafsofa (4 rooms) ─────────────────────────────────────
INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '04', 'Zimmer 04', 1, 10, true FROM room_types WHERE category = 'double_sofa';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '05', 'Zimmer 05', 1, 11, true FROM room_types WHERE category = 'double_sofa';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '10', 'Zimmer 10', 1, 12, true FROM room_types WHERE category = 'double_sofa';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '15', 'Zimmer 15', 1, 13, true FROM room_types WHERE category = 'double_sofa';

-- ── Doppelzimmer (8 rooms — incl. connecting rooms 11+12 and 19+20) ───────────
INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '11', 'Zimmer 11', 2, 20, true FROM room_types WHERE category = 'double';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '12', 'Zimmer 12', 2, 21, true FROM room_types WHERE category = 'double';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '14', 'Zimmer 14', 2, 22, true FROM room_types WHERE category = 'double';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '16', 'Zimmer 16', 2, 23, true FROM room_types WHERE category = 'double';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '17', 'Zimmer 17', 2, 24, true FROM room_types WHERE category = 'double';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '18', 'Zimmer 18', 2, 25, true FROM room_types WHERE category = 'double';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '19', 'Zimmer 19', 2, 26, true FROM room_types WHERE category = 'double';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '20', 'Zimmer 20', 2, 27, true FROM room_types WHERE category = 'double';

-- ── Einzelzimmer (4 rooms — incl. connecting rooms 21+22) ────────────────────
INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '21', 'Zimmer 21', 3, 30, true FROM room_types WHERE category = 'single';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '22', 'Zimmer 22', 3, 31, true FROM room_types WHERE category = 'single';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '23', 'Zimmer 23', 3, 32, true FROM room_types WHERE category = 'single';

INSERT INTO rooms (id, room_type_id, room_number, name, floor, sort_order, is_active)
SELECT gen_random_uuid(), id, '24', 'Zimmer 24', 3, 33, true FROM room_types WHERE category = 'single';

-- ── Notes on connecting rooms ──────────────────────────────────────────────────
-- Zimmer 11 + 12: verbundene Doppelzimmer (Verbindungstür) → Familienzimmer
-- Zimmer 19 + 20: verbundene Doppelzimmer (Verbindungstür) → Familienzimmer
-- Zimmer 21 + 22: verbundene Einzelzimmer (Verbindungstür) → Familienzimmer
--
-- iCal-Sync für Familienzimmer (Booking.com ID 6712906):
-- Den gleichen iCal-Import-Feed beiden verbundenen Zimmern hinzufügen.
-- z.B. Booking.com Family iCal → Zimmer 11 importieren UND Zimmer 12 importieren
-- So werden bei einer Familienbuchung BEIDE Zimmer automatisch blockiert.
