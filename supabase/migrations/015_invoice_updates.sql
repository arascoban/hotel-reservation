-- ============================================================
-- 015 – Invoice early-departure columns
-- ============================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS early_departure  BOOLEAN      NOT NULL DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS original_nights  INT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS original_price   NUMERIC(10,2);
