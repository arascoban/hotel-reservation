/**
 * Bank details and legal information printed at the foot of every invoice.
 *
 * Edited under Einstellungen (invoice_settings.footer_*). Each invoice keeps
 * its own copy in invoices.footer, taken when it is issued, so a later change
 * — a new bank, a new tax number — only reaches invoices written afterwards.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface InvoiceFooter {
  bankName:      string
  accountHolder: string
  iban:          string
  bic:           string
  register:      string
  taxNumber:     string
  vatId:         string
  signerName:    string
  signerTitle:   string
}

/**
 * What every invoice printed before the footer became editable. Invoices
 * without their own copy (issued earlier) render with exactly these values.
 */
export const LEGACY_FOOTER: InvoiceFooter = {
  bankName:      'HASPA HAMBURG',
  accountHolder: 'Aaron Eddie Cetin',
  iban:          'DE33 2005 0550 1501 0613 43',
  bic:           'HASPDEHHXXX',
  register:      'Amtsgericht Oldenburg HRB 200157',
  taxNumber:     '35 / 202 / 02346',
  vatId:         'DE406004895',
  signerName:    'A. Eddie Çetin',
  signerTitle:   'Geschäftsführer',
}

export const FOOTER_COLUMNS =
  'footer_bank_name, footer_account_holder, footer_iban, footer_bic, footer_register, ' +
  'footer_tax_number, footer_vat_id, footer_signer_name, footer_signer_title'

/* eslint-disable @typescript-eslint/no-explicit-any */
export function footerFromSettings(row: any): InvoiceFooter {
  if (!row) return LEGACY_FOOTER
  return {
    bankName:      row.footer_bank_name      ?? LEGACY_FOOTER.bankName,
    accountHolder: row.footer_account_holder ?? LEGACY_FOOTER.accountHolder,
    iban:          row.footer_iban           ?? LEGACY_FOOTER.iban,
    bic:           row.footer_bic            ?? LEGACY_FOOTER.bic,
    register:      row.footer_register       ?? LEGACY_FOOTER.register,
    taxNumber:     row.footer_tax_number     ?? LEGACY_FOOTER.taxNumber,
    vatId:         row.footer_vat_id         ?? LEGACY_FOOTER.vatId,
    signerName:    row.footer_signer_name    ?? LEGACY_FOOTER.signerName,
    signerTitle:   row.footer_signer_title   ?? LEGACY_FOOTER.signerTitle,
  }
}

/** The footer an invoice prints: its own copy, or the legacy one. */
export function footerOfInvoice(inv: any): InvoiceFooter {
  const f = inv?.footer
  return f && typeof f === 'object' ? { ...LEGACY_FOOTER, ...f } : LEGACY_FOOTER
}

/** Current settings — what a newly issued invoice will carry. */
export async function loadCurrentFooter(
  supabase: SupabaseClient<any, any, any>,
): Promise<InvoiceFooter> {
  const { data } = await supabase
    .from('invoice_settings').select(FOOTER_COLUMNS).eq('id', 1).maybeSingle()
  return footerFromSettings(data)
}
