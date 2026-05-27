-- Migration: 020_child_count.sql
-- Add child_count column to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS child_count INTEGER NOT NULL DEFAULT 0;
