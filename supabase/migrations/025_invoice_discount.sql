-- Migration: 025_invoice_discount.sql
-- Add optional discount amount to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) NOT NULL DEFAULT 0;
