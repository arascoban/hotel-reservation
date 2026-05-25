-- Migration 019: Custom line items on invoices
-- Stores additional / editable positions as a JSONB array.
-- Each item: { id, description, qty, unit_price (gross), vat_rate (7|19) }

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS line_items JSONB NOT NULL DEFAULT '[]'::jsonb;
