-- Migration: 022_invoice_room2.sql
-- Allow invoices to include a second room booking
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS room2_number      TEXT,
  ADD COLUMN IF NOT EXISTS room2_name        TEXT,
  ADD COLUMN IF NOT EXISTS room2_total_price NUMERIC(10,2);
