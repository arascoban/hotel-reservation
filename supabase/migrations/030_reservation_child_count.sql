-- Migration: 030_reservation_child_count.sql
-- Add child_count to reservations so PHP booking form can store adult/child breakdown.
-- guest_count = adult_count (derived) + child_count; existing rows default to 0 children.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS child_count INTEGER NOT NULL DEFAULT 0;
