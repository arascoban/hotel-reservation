-- Migration: 028_invoice_salutation.sql
-- Add optional salutation (Anrede) to invoices for proper email greeting.
-- Values: 'Herr', 'Frau', or NULL (fallback to gender-neutral greeting).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS salutation TEXT;
