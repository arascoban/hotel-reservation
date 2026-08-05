-- Migration: 032_central_customers.sql
-- Central customer system.
--
-- Until now addresses lived in three disconnected places:
--   reservations.guest_street/postcode/city/country
--   customers.street/postcode/city/country
--   invoices.guest_address (text snapshot)
-- Nothing linked them, so an address entered on the calendar never reached
-- the Kunden page or a later invoice.
--
-- This migration makes `customers` the single source of truth by adding a
-- real foreign key from reservations, then backfilling existing rows.
-- Invoices keep their own text snapshot on purpose: a issued invoice must
-- keep the address as it was at issue time (§14 UStG), so it must NOT change
-- when the customer later moves.

-- ── 1. Link column ───────────────────────────────────────────────────────────
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reservations_customer ON reservations (customer_id);

-- Case-insensitive lookup indexes used by findOrCreateCustomer()
CREATE INDEX IF NOT EXISTS customers_lower_email_idx ON customers (lower(email));
CREATE INDEX IF NOT EXISTS customers_lower_name_idx  ON customers (lower(name));


-- ── 2. Backfill: link reservations to existing customers ─────────────────────
-- Pass 1 — match on email (strongest signal).
UPDATE reservations r
SET    customer_id = c.id
FROM   customers c
WHERE  r.customer_id IS NULL
  AND  r.guest_email IS NOT NULL
  AND  trim(r.guest_email) <> ''
  AND  lower(trim(c.email)) = lower(trim(r.guest_email));

-- Pass 2 — remaining rows match on exact (case-insensitive) name.
UPDATE reservations r
SET    customer_id = c.id
FROM   customers c
WHERE  r.customer_id IS NULL
  AND  lower(trim(c.name)) = lower(trim(r.guest_name));


-- ── 3. Create customers for reservations that still have no match ────────────
WITH unmatched AS (
  SELECT DISTINCT ON (lower(trim(guest_name)), lower(trim(COALESCE(guest_email, ''))))
    trim(guest_name)                                  AS name,
    NULLIF(trim(COALESCE(guest_email,    '')), '')    AS email,
    NULLIF(trim(COALESCE(guest_phone,    '')), '')    AS phone,
    NULLIF(trim(COALESCE(guest_street,   '')), '')    AS street,
    NULLIF(trim(COALESCE(guest_postcode, '')), '')    AS postcode,
    NULLIF(trim(COALESCE(guest_city,     '')), '')    AS city,
    NULLIF(trim(COALESCE(guest_country,  '')), '')    AS country
  FROM   reservations
  WHERE  customer_id IS NULL
    AND  guest_name IS NOT NULL
    AND  trim(guest_name) <> ''
    AND  deleted_at IS NULL
  ORDER  BY lower(trim(guest_name)),
            lower(trim(COALESCE(guest_email, ''))),
            created_at DESC
)
INSERT INTO customers (name, email, phone, street, postcode, city, country, source)
SELECT name, email, phone, street, postcode, city, country, 'reservation'
FROM   unmatched;

-- Link the rows we just created.
UPDATE reservations r
SET    customer_id = c.id
FROM   customers c
WHERE  r.customer_id IS NULL
  AND  lower(trim(c.name)) = lower(trim(r.guest_name))
  AND  (
        (r.guest_email IS NULL OR trim(r.guest_email) = '')
     OR lower(trim(COALESCE(c.email, ''))) = lower(trim(r.guest_email))
  );


-- ── 4. Enrich customers from reservation data ────────────────────────────────
-- Fill blank customer address fields from the newest reservation that has one.
-- Only blanks are filled — hand-entered customer data is never overwritten.
WITH newest AS (
  SELECT DISTINCT ON (customer_id)
    customer_id,
    NULLIF(trim(COALESCE(guest_street,   '')), '') AS street,
    NULLIF(trim(COALESCE(guest_postcode, '')), '') AS postcode,
    NULLIF(trim(COALESCE(guest_city,     '')), '') AS city,
    NULLIF(trim(COALESCE(guest_country,  '')), '') AS country,
    NULLIF(trim(COALESCE(guest_email,    '')), '') AS email,
    NULLIF(trim(COALESCE(guest_phone,    '')), '') AS phone
  FROM   reservations
  WHERE  customer_id IS NOT NULL
    AND  deleted_at IS NULL
  ORDER  BY customer_id, created_at DESC
)
UPDATE customers c
SET    street   = COALESCE(c.street,   n.street),
       postcode = COALESCE(c.postcode, n.postcode),
       city     = COALESCE(c.city,     n.city),
       country  = COALESCE(c.country,  n.country),
       email    = COALESCE(c.email,    n.email),
       phone    = COALESCE(c.phone,    n.phone)
FROM   newest n
WHERE  c.id = n.customer_id;


-- ── 5. Merge helper ──────────────────────────────────────────────────────────
-- Moves every reservation from p_source to p_target, fills blank fields on the
-- target from the source, then deletes the source. Used by the "Zusammenführen"
-- button on the Kunden page to clean up duplicates.
CREATE OR REPLACE FUNCTION merge_customers(p_target UUID, p_source UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_target = p_source THEN
    RAISE EXCEPTION 'Cannot merge a customer into itself';
  END IF;

  UPDATE customers t
  SET    email    = COALESCE(t.email,    s.email),
         phone    = COALESCE(t.phone,    s.phone),
         street   = COALESCE(t.street,   s.street),
         postcode = COALESCE(t.postcode, s.postcode),
         city     = COALESCE(t.city,     s.city),
         country  = COALESCE(t.country,  s.country),
         notes    = COALESCE(t.notes,    s.notes)
  FROM   customers s
  WHERE  t.id = p_target AND s.id = p_source;

  UPDATE reservations SET customer_id = p_target WHERE customer_id = p_source;

  DELETE FROM customers WHERE id = p_source;
END;
$$;

GRANT EXECUTE ON FUNCTION merge_customers TO authenticated;
