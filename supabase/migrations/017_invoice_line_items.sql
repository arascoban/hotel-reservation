-- Migration 017: Extended invoice line items
-- Stores breakfast and room-service data as a snapshot at the time of checkout.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS guest_count                INT            NOT NULL DEFAULT 1;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS breakfast_price_per_person  NUMERIC(10,2)  NOT NULL DEFAULT 10.00;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS room_service_total          NUMERIC(10,2)  NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS room_service_items          JSONB;
