-- Migration: 031_invoice_cancellation.sql
-- Stornierung (cancellation) support for invoices.
-- cancelled_at NULL  = active invoice
-- cancelled_at set   = storniert (kept for records; invoice number is NOT reused)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
