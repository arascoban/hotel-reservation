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
-- One customer record per unique guest_name, picking the most recent reservation's contact data.

INSERT INTO customers (name, email, phone, street, postcode, city, country, source, created_at)
SELECT DISTINCT ON (lower(trim(guest_name)))
  trim(guest_name)                          AS name,
  NULLIF(trim(COALESCE(guest_email, '')), '')   AS email,
  NULLIF(trim(COALESCE(guest_phone, '')), '')   AS phone,
  NULLIF(trim(COALESCE(guest_street, '')), '')  AS street,
  NULLIF(trim(COALESCE(guest_postcode, '')), '') AS postcode,
  NULLIF(trim(COALESCE(guest_city, '')), '')    AS city,
  NULLIF(trim(COALESCE(guest_country, '')), '') AS country,
  'reservation'                             AS source,
  MIN(created_at)                           AS created_at
FROM reservations
WHERE guest_name IS NOT NULL
  AND trim(guest_name) <> ''
  AND deleted_at IS NULL
GROUP BY lower(trim(guest_name)), trim(guest_name),
         trim(COALESCE(guest_email, '')),
         trim(COALESCE(guest_phone, '')),
         trim(COALESCE(guest_street, '')),
         trim(COALESCE(guest_postcode, '')),
         trim(COALESCE(guest_city, '')),
         trim(COALESCE(guest_country, ''))
ORDER BY lower(trim(guest_name)), MIN(created_at) DESC
ON CONFLICT DO NOTHING;
