-- ============================================================
-- 014 – Invoice system
-- ============================================================

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number     INT  UNIQUE NOT NULL,
  reservation_id     UUID REFERENCES reservations(id) ON DELETE SET NULL,
  guest_name         TEXT NOT NULL,
  guest_email        TEXT,
  guest_address      TEXT,
  room_number        TEXT NOT NULL,
  room_name          TEXT NOT NULL,
  checkin_at         TIMESTAMPTZ NOT NULL,
  checkout_at        TIMESTAMPTZ NOT NULL,
  nights             INT NOT NULL DEFAULT 1,
  total_price        NUMERIC(10,2) NOT NULL,
  payment_method     TEXT NOT NULL DEFAULT 'cash',
  breakfast_included BOOLEAN NOT NULL DEFAULT false,
  notes              TEXT,
  created_by         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single-row settings (admin controls next invoice number)
CREATE TABLE IF NOT EXISTS invoice_settings (
  id          INT PRIMARY KEY DEFAULT 1,
  next_number INT NOT NULL DEFAULT 1,
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO invoice_settings (id, next_number)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

-- Atomically claim and increment the next invoice number
CREATE OR REPLACE FUNCTION get_next_invoice_number()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_next INT;
BEGIN
  UPDATE invoice_settings
  SET    next_number = next_number + 1,
         updated_at  = now()
  WHERE  id = 1
  RETURNING next_number - 1 INTO v_next;
  RETURN v_next;
END;
$$;

-- RLS
ALTER TABLE invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_invoices"
  ON invoices FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_invoices"
  ON invoices FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_invoices"
  ON invoices FOR UPDATE TO authenticated USING (true);

CREATE POLICY "auth_delete_invoices"
  ON invoices FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_read_invoice_settings"
  ON invoice_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_update_invoice_settings"
  ON invoice_settings FOR UPDATE TO authenticated USING (true);
