-- Migration: 043_breakfast_vat.sql
-- Breakfast is taxed at 19 %, not at the reduced 7 % that applies to the
-- overnight stay (Aufteilungsgebot).
--
-- The invoice derives net and VAT from the stored gross amounts at render
-- time, so simply changing the rate in code would silently redraw invoices
-- that have already been issued and handed to guests. The rate therefore
-- lives on the invoice: rows that exist now keep the 7 % they were issued
-- with, everything from here on uses 19 %.

-- Existing rows take the column default …
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS breakfast_vat_rate NUMERIC(4,2) NOT NULL DEFAULT 7;

-- … and new ones get the correct rate.
ALTER TABLE invoices
  ALTER COLUMN breakfast_vat_rate SET DEFAULT 19;
