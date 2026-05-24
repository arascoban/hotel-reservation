-- Migration 018: Customer system
-- Tracks all guests with their contact info and stay history.

CREATE TABLE IF NOT EXISTS customers (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT           NOT NULL,
  email       TEXT,
  phone       TEXT,
  street      TEXT,
  postcode    TEXT,
  city        TEXT,
  country     TEXT,
  notes       TEXT,
  source      TEXT           DEFAULT 'manual',   -- 'manual' | 'booking.com' | 'reservation'
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_name_idx  ON customers (lower(name));
CREATE INDEX IF NOT EXISTS customers_email_idx ON customers (lower(email));

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_updated_at_trigger ON customers;
CREATE TRIGGER customers_updated_at_trigger
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_customers_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "customers_select" ON customers
  FOR SELECT USING (auth.role() = 'authenticated');

-- All authenticated users can insert/update/delete
CREATE POLICY "customers_insert" ON customers
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "customers_update" ON customers
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "customers_delete" ON customers
  FOR DELETE USING (auth.role() = 'authenticated');

-- ── Backfill from existing reservations ─────────────────────────────────────
-- One customer record per unique guest_name, using only columns that are
-- guaranteed to exist (guest_name, guest_email, guest_phone).
-- Address fields (guest_street etc.) are added by migration 016 — if that
-- migration has already been run the DO block below will also populate them.

INSERT INTO customers (name, email, phone, source, created_at)
SELECT DISTINCT ON (lower(trim(guest_name)))
  trim(guest_name)                               AS name,
  NULLIF(trim(COALESCE(guest_email, '')), '')    AS email,
  NULLIF(trim(COALESCE(guest_phone, '')), '')    AS phone,
  'reservation'                                  AS source,
  MIN(created_at)                                AS created_at
FROM reservations
WHERE guest_name IS NOT NULL
  AND trim(guest_name) <> ''
  AND deleted_at IS NULL
GROUP BY lower(trim(guest_name)), trim(guest_name),
         trim(COALESCE(guest_email, '')),
         trim(COALESCE(guest_phone, ''))
ORDER BY lower(trim(guest_name)), MIN(created_at) DESC
ON CONFLICT DO NOTHING;

-- ── Optionally enrich with address fields if migration 016 was applied ────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reservations' AND column_name = 'guest_street'
  ) THEN
    UPDATE customers c
    SET
      street   = sub.street,
      postcode = sub.postcode,
      city     = sub.city,
      country  = sub.country
    FROM (
      SELECT DISTINCT ON (lower(trim(guest_name)))
        trim(guest_name)                                AS name,
        NULLIF(trim(COALESCE(guest_street,   '')), '') AS street,
        NULLIF(trim(COALESCE(guest_postcode, '')), '') AS postcode,
        NULLIF(trim(COALESCE(guest_city,     '')), '') AS city,
        NULLIF(trim(COALESCE(guest_country,  '')), '') AS country
      FROM reservations
      WHERE guest_name IS NOT NULL AND trim(guest_name) <> ''
        AND deleted_at IS NULL
      ORDER BY lower(trim(guest_name)), created_at DESC
    ) sub
    WHERE lower(trim(c.name)) = lower(trim(sub.name));
  END IF;
END;
$$;
