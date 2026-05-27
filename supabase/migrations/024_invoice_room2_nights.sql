-- Migration: 024_invoice_room2_nights.sql
-- Add explicit night count for the second room (can differ from room 1)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS room2_nights INTEGER;
