-- Migration: 023_invoice_room2_dates.sql
-- Add separate check-in/check-out times and guest counts for the second room
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS room2_checkin_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS room2_checkout_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS room2_guest_count  INTEGER,
  ADD COLUMN IF NOT EXISTS room2_child_count  INTEGER;
