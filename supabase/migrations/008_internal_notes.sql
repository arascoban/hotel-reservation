-- Add internal_notes column to reservations
-- This note is only visible internally (not shown in emails or PDF confirmations)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;
