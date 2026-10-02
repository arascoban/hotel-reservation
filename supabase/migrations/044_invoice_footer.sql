-- Migration: 044_invoice_footer.sql
-- Bank details and legal information on the invoice footer, editable under
-- Einstellungen.
--
-- The settings row holds what *new* invoices print. Every invoice stores its
-- own copy in invoices.footer at the moment it is issued, so changing the
-- IBAN or the tax number later never alters an invoice already handed out.
-- Invoices issued before this migration have no copy (NULL) and keep
-- printing the values they were issued with, which the app falls back to.

ALTER TABLE invoice_settings
  ADD COLUMN IF NOT EXISTS footer_bank_name      TEXT NOT NULL DEFAULT 'HASPA HAMBURG',
  ADD COLUMN IF NOT EXISTS footer_account_holder TEXT NOT NULL DEFAULT 'Aaron Eddie Cetin',
  ADD COLUMN IF NOT EXISTS footer_iban           TEXT NOT NULL DEFAULT 'DE33 2005 0550 1501 0613 43',
  ADD COLUMN IF NOT EXISTS footer_bic            TEXT NOT NULL DEFAULT 'HASPDEHHXXX',
  ADD COLUMN IF NOT EXISTS footer_register       TEXT NOT NULL DEFAULT 'Amtsgericht Oldenburg HRB 200157',
  ADD COLUMN IF NOT EXISTS footer_tax_number     TEXT NOT NULL DEFAULT '35 / 202 / 02346',
  ADD COLUMN IF NOT EXISTS footer_vat_id         TEXT NOT NULL DEFAULT 'DE406004895',
  ADD COLUMN IF NOT EXISTS footer_signer_name    TEXT NOT NULL DEFAULT 'A. Eddie Çetin',
  ADD COLUMN IF NOT EXISTS footer_signer_title   TEXT NOT NULL DEFAULT 'Geschäftsführer';

-- Snapshot per invoice. NULL = issued before this existed.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS footer JSONB;
