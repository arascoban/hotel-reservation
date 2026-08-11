'use client'

import { useState } from 'react'
import { Printer, Download, Loader2, AlertCircle, FileText } from 'lucide-react'
import { saveInvoicePdf } from '@/lib/pdfCapture'

/**
 * Drucken and PDF speichern, kept apart.
 *
 * They are genuinely different jobs: printing hands the sheets to the browser
 * and depends on its print settings, while the PDF is captured exactly the way
 * the e-mailed one is — the same code path, so what the guest receives and
 * what gets filed are the same document.
 */
export default function InvoiceActions({ invoiceRef, invoiceId }: { invoiceRef: string; invoiceId: string }) {
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      await saveInvoicePdf(`Rechnung_${invoiceRef}.pdf`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF konnte nicht erstellt werden.')
    }
    setSaving(false)
  }

  return (
    <>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 h-10 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Printer className="w-4 h-4" />
        Drucken
      </button>

      <button
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 h-10 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {saving ? 'Wird erstellt …' : 'PDF speichern'}
      </button>

      {/* Test: the server-rendered vector PDF, alongside the capture above so
          the two can be compared on the same invoice. */}
      <a
        href={`/api/invoices/${invoiceId}/pdf`}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-4 h-10 text-sm font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
      >
        <FileText className="w-4 h-4" />
        PDF (Vektor · Test)
      </a>

      {error && (
        <span className="inline-flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </span>
      )}
    </>
  )
}
