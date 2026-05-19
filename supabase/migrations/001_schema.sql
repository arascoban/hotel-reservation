-- ============================================================
-- Hotel Reservation System — Database Schema
-- Migration: 001_schema.sql
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist"; -- Required for EXCLUDE range constraint


-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE reservation_source AS ENUM (
  'booking_com',
  'expedia',
  'airbnb',
  'walk_in',
  'phone',
  'website',
  'other'
);

CREATE TYPE payment_method_type AS ENUM (
  'cash',
  'ec_card',
  'credit_card',
  'online',
  'unpaid'
);

CREATE TYPE payment_status_type AS ENUM (
  'paid',
  'deposit_paid',
  'unpaid',
  'refunded'
);

CREATE TYPE reservation_status_type AS ENUM (
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
  'no_show'
);

CREATE TYPE sync_feed_type AS ENUM (
  'import',
  'export'
);

CREATE TYPE sync_log_status AS ENUM (
  'success',
  'error',
  'partial'
);

-- Room type category — drives capacity rules and calendar grouping
CREATE TYPE room_type_category AS ENUM (
  'single',           -- Single Rooms (max 1)
  'double',           -- Double Rooms (max 2)
  'double_sofa',      -- Double Rooms with Sofa Bed (max 3)
  'family_double',    -- Family Room + second room with double bed (max 4)
  'family_single'     -- Family Room + second room with single bed (max 3)
);


-- ============================================================
-- TABLE: room_types
-- Defines the category, display name, and capacity rules
-- for each type of sellable unit.
-- ============================================================

CREATE TABLE room_types (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category         room_type_category NOT NULL UNIQUE,
  name             TEXT NOT NULL,           -- Display name, e.g. "Double Room with Sofa Bed"
  base_capacity    INT NOT NULL,            -- Normal/standard capacity
  max_capacity     INT NOT NULL,            -- Maximum allowed guests
  sort_order       INT NOT NULL DEFAULT 0,  -- Controls calendar row grouping order
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT room_types_capacity_check CHECK (max_capacity >= base_capacity AND base_capacity >= 1)
);

CREATE INDEX idx_room_types_sort ON room_types (sort_order);


-- ============================================================
-- TABLE: rooms
-- Each row is one sellable calendar unit (13 total for MVP).
-- In the future, a bookable unit may link to multiple
-- physical rooms (see physical_rooms table stub below).
-- ============================================================

CREATE TABLE rooms (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_type_id   UUID NOT NULL REFERENCES room_types (id) ON DELETE RESTRICT,
  room_number    TEXT NOT NULL UNIQUE,   -- e.g. "101", "F1"
  name           TEXT NOT NULL,          -- Display name, e.g. "Room 101 — Single"
  floor          INT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order     INT NOT NULL DEFAULT 0,  -- Controls order within room type group
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rooms_room_type ON rooms (room_type_id);
CREATE INDEX idx_rooms_active ON rooms (is_active);
CREATE INDEX idx_rooms_sort ON rooms (sort_order);


-- ============================================================
-- TABLE: guests
-- Stores guest profile data. Reservations reference guests
-- but also cache name/email/phone for fast access.
-- ============================================================

CREATE TABLE guests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name    TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_guests_email ON guests (email) WHERE email IS NOT NULL;
CREATE INDEX idx_guests_phone ON guests (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_guests_name ON guests USING gin (to_tsvector('simple', full_name));


-- ============================================================
-- TABLE: reservations
-- Core table. Each row is one booking for one room unit.
--
-- Timestamps:
--   checkin_at  — includes date + default time 15:00 (hotel local time, stored as UTC)
--   checkout_at — includes date + default time 11:00
--
-- Conflict detection uses EXCLUDE constraint with tstzrange.
-- ============================================================

CREATE TABLE reservations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Room
  room_id          UUID NOT NULL REFERENCES rooms (id) ON DELETE RESTRICT,

  -- Guest (optional foreign key; iCal imports may not have a guest profile)
  guest_id         UUID REFERENCES guests (id) ON DELETE SET NULL,

  -- Denormalized guest info for fast display without joining guests table
  guest_name       TEXT NOT NULL,
  guest_email      TEXT,
  guest_phone      TEXT,

  -- Dates & times (full timestamps, stored in UTC)
  checkin_at       TIMESTAMPTZ NOT NULL,  -- e.g. 2026-05-19 13:00:00+00 (= 15:00 local CET+2)
  checkout_at      TIMESTAMPTZ NOT NULL,  -- e.g. 2026-05-22 09:00:00+00 (= 11:00 local CET+2)

  -- Stay details
  guest_count         INT NOT NULL DEFAULT 1,
  breakfast_included  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Metadata
  source           reservation_source NOT NULL DEFAULT 'other',
  payment_method   payment_method_type NOT NULL DEFAULT 'unpaid',
  payment_status   payment_status_type NOT NULL DEFAULT 'unpaid',
  status           reservation_status_type NOT NULL DEFAULT 'confirmed',

  total_price      NUMERIC(10, 2),
  notes            TEXT,
  external_id      TEXT,    -- Booking.com / Expedia / Airbnb reservation ID

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Basic sanity checks
  CONSTRAINT reservations_dates_check
    CHECK (checkout_at > checkin_at),

  CONSTRAINT reservations_guest_count_check
    CHECK (guest_count >= 1)
);

-- -------------------------------------------------------
-- CORE CONFLICT CONSTRAINT
-- Uses btree_gist + tstzrange to prevent double-bookings.
-- Range type '[)' = inclusive start, exclusive end.
--
-- Two reservations A=[s1,e1) and B=[s2,e2) overlap when:
--   s1 < e2  AND  s2 < e1
-- This matches the business rule:
--   new_checkin_at < existing_checkout_at
--   AND new_checkout_at > existing_checkin_at
--
-- Same-day checkout (11:00) + check-in (15:00) is allowed
-- because 11:00 < 15:00, so the ranges [s1,11:00) and
-- [15:00,e2) do NOT overlap.
--
-- Cancelled and no-show reservations are excluded from
-- conflict detection via the WHERE clause.
-- -------------------------------------------------------
ALTER TABLE reservations
  ADD CONSTRAINT reservations_no_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(checkin_at, checkout_at, '[)') WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'no_show'));

-- Standard query indexes
CREATE INDEX idx_reservations_room_id ON reservations (room_id);
CREATE INDEX idx_reservations_guest_id ON reservations (guest_id) WHERE guest_id IS NOT NULL;
CREATE INDEX idx_reservations_status ON reservations (status);
CREATE INDEX idx_reservations_checkin ON reservations (checkin_at);
CREATE INDEX idx_reservations_checkout ON reservations (checkout_at);
CREATE INDEX idx_reservations_payment_status ON reservations (payment_status);
CREATE INDEX idx_reservations_source ON reservations (source);
CREATE INDEX idx_reservations_external_id ON reservations (external_id) WHERE external_id IS NOT NULL;

-- Range index for calendar queries (overlapping date range lookups)
CREATE INDEX idx_reservations_range ON reservations
  USING gist (tstzrange(checkin_at, checkout_at, '[)'));

-- Full-text search on guest name
CREATE INDEX idx_reservations_guest_name ON reservations
  USING gin (to_tsvector('simple', guest_name));


-- ============================================================
-- TABLE: sync_feeds
-- Stores iCal import URLs and export configuration per room.
-- Phase 2 feature — table created now for schema completeness.
-- ============================================================

CREATE TABLE sync_feeds (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id        UUID NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  platform       reservation_source NOT NULL,
  feed_type      sync_feed_type NOT NULL,   -- 'import' or 'export'
  url            TEXT,                       -- NULL for export feeds (URL is generated)
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Only one import feed per room per platform
  CONSTRAINT sync_feeds_unique_import
    UNIQUE NULLS NOT DISTINCT (room_id, platform, feed_type)
);

CREATE INDEX idx_sync_feeds_room ON sync_feeds (room_id);
CREATE INDEX idx_sync_feeds_active ON sync_feeds (is_active) WHERE is_active = TRUE;


-- ============================================================
-- TABLE: sync_logs
-- Records every iCal sync attempt.
-- ============================================================

CREATE TABLE sync_logs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_feed_id      UUID NOT NULL REFERENCES sync_feeds (id) ON DELETE CASCADE,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  status            sync_log_status,
  events_imported   INT DEFAULT 0,
  events_updated    INT DEFAULT 0,
  events_skipped    INT DEFAULT 0,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_logs_feed ON sync_logs (sync_feed_id);
CREATE INDEX idx_sync_logs_started ON sync_logs (started_at DESC);


-- ============================================================
-- FUTURE TABLE STUBS (Phase 2 — Physical Room Mapping)
-- Not used in MVP. Created as stubs to document the intended
-- schema evolution without breaking the MVP model.
-- ============================================================

-- Represents actual physical rooms in the hotel building.
-- A sellable unit (rooms) may consist of 1 or more physical rooms.
CREATE TABLE physical_rooms (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  physical_number TEXT NOT NULL UNIQUE,  -- e.g. "101A", "101B"
  floor          INT,
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Links bookable units (rooms) to their constituent physical rooms.
-- Example: Family Room F1 (rooms.id) → physical rooms 201 + 202.
CREATE TABLE bookable_unit_physical_rooms (
  room_id          UUID NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  physical_room_id UUID NOT NULL REFERENCES physical_rooms (id) ON DELETE CASCADE,
  PRIMARY KEY (room_id, physical_room_id)
);


-- ============================================================
-- UPDATED_AT TRIGGER (applies to all tables that need it)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_room_types_updated_at
  BEFORE UPDATE ON room_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_guests_updated_at
  BEFORE UPDATE ON guests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_sync_feeds_updated_at
  BEFORE UPDATE ON sync_feeds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
