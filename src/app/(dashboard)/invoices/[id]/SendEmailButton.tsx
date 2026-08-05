'use client'

import { useState } from 'react'
import { Mail, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { captureInvoicePdf } from '@/lib/pdfCapture'

interface Props {
  invoiceRef:   string        // e.g. "R26_001"
  guestEmail:   string | null
  salutation:   string | null // 'Herr' | 'Frau' | null
  guestSurname: string
  checkinStr:   string        // e.g. "15.05.2026"
  checkoutStr:  string
  isFreeform?:  boolean       // free-text invoice → email omits stay dates
}

type Status = 'idle' | 'generating' | 'sending' | 'success' | 'error'

export default function SendEmailButton({
  invoiceRef,
  guestEmail,
  salutation,
  guestSurname,
  checkinStr,
  checkoutStr,
  isFreeform = false,
}: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleClick = async () => {
    if (!guestEmail) {
      alert('Kein E-Mail für diesen Gast hinterlegt.')
      return
    }

    try {
      // ── 1. Capture the rendered invoice as an A4 PDF ───────────────
      setStatus('generating')
      const pdfBase64 = await captureInvoicePdf()

      // ── 3. POST to API ──────────────────────────────────────────────
      setStatus('sending')

      const res = await fetch('/api/invoices/send-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pdfBase64, guestEmail, salutation, guestSurname, checkinStr, checkoutStr, invoiceRef, freeform: isFreeform }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? 'Fehler beim Senden')
      }

      setStatus('success')
      setTimeout(() => setStatus('idle'), 5000)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
      setStatus('error')
      setErrorMsg(msg)
      setTimeout(() => setStatus('idle'), 6000)
    }
  }

  const busy = status === 'generating' || status === 'sending'

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={[
        'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
        status === 'success'
          ? 'border-green-300 bg-green-50 text-green-700'
          : status === 'error'
          ? 'border-red-300 bg-red-50 text-red-700'
          : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100',
        busy ? 'cursor-not-allowed opacity-60' : '',
      ].join(' ')}
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : status === 'success' ? (
        <CheckCircle className="w-4 h-4" />
      ) : status === 'error' ? (
        <AlertCircle className="w-4 h-4" />
      ) : (
        <Mail className="w-4 h-4" />
      )}

      {status === 'generating' ? 'PDF erstellen…'
       : status === 'sending'  ? 'Sende…'
       : status === 'success'  ? 'Gesendet!'
       : status === 'error'    ? `Fehler: ${errorMsg.slice(0, 40)}`
       : 'Per E-Mail senden'}
    </button>
  )
}
