-- Add billing address column for future invoice generation
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS billing_address TEXT;
