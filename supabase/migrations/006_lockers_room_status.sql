-- ============================================================
-- Migration 006: Lockers + room cleaning status
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Lockers table (admin manages PIN codes, assigns to guests)
CREATE TABLE IF NOT EXISTS lockers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  locker_number TEXT NOT NULL UNIQUE,
  pin_code      TEXT NOT NULL DEFAULT '0000',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed some default lockers (adjust numbers to match your hotel)
INSERT INTO lockers (locker_number, pin_code) VALUES
  ('1',  '0000'), ('2',  '0000'), ('3',  '0000'), ('4',  '0000'),
  ('5',  '0000'), ('6',  '0000'), ('7',  '0000'), ('8',  '0000'),
  ('9',  '0000'), ('10', '0000'), ('11', '0000'), ('12', '0000')
ON CONFLICT (locker_number) DO NOTHING;

-- 2. Link a locker to a reservation (nullable — not every booking needs a locker)
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS locker_id UUID REFERENCES lockers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_locker ON reservations(locker_id) WHERE locker_id IS NOT NULL;

-- 3. Room cleaning status (for the Zimmerstatus board)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'room_cleaning_status') THEN
    CREATE TYPE room_cleaning_status AS ENUM ('clean', 'dirty', 'maintenance');
  END IF;
END $$;

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cleaning_status room_cleaning_status DEFAULT 'clean';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cleaning_note TEXT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cleaning_updated_at TIMESTAMPTZ DEFAULT NOW();

-- 4. Auto-update updated_at on lockers
CREATE OR REPLACE FUNCTION update_locker_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_locker_updated ON lockers;
CREATE TRIGGER trg_locker_updated
  BEFORE UPDATE ON lockers
  FOR EACH ROW EXECUTE FUNCTION update_locker_updated_at();
