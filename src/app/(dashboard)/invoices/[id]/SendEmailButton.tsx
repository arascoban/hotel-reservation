'use client'

import { useState } from 'react'
import { Mail, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface Props {
  invoiceRef:   string        // e.g. "R26_001"
  guestEmail:   string | null
  guestSurname: string
  checkinStr:   string        // e.g. "15.05.2026"
  checkoutStr:  string
}

type Status = 'idle' | 'generating' | 'sending' | 'success' | 'error'

export default function SendEmailButton({
  invoiceRef,
  guestEmail,
  guestSurname,
  checkinStr,
  checkoutStr,
}: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleClick = async () => {
    if (!guestEmail) {
      alert('Kein E-Mail für diesen Gast hinterlegt.')
      return
    }

    try {
      // ── 1. Capture the .page div as an image ───────────────────────
      setStatus('generating')

      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const pageEl = document.querySelector('.page') as HTMLElement | null
      if (!pageEl) throw new Error('Invoice page element not found')

      const canvas = await html2canvas(pageEl, {
        scale:           2,
        useCORS:         true,
        allowTaint:      false,
        backgroundColor: '#ffffff',
        logging:         false,
      })

      // ── 2. Build the PDF (JPEG avoids PNG signature issues) ─────────
      // Use JPEG — jsPDF reliably handles JPEG; PNG can trigger
      // "wrong png signature" errors with some canvas content.
      const imgData = canvas.toDataURL('image/jpeg', 0.92)

      const pdf     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW    = pdf.internal.pageSize.getWidth()    // 210 mm
      const pdfH    = pdf.internal.pageSize.getHeight()   // 297 mm
      const imgH    = (canvas.height / canvas.width) * pdfW

      // Standard multi-page pattern: place full image at negative y offset
      // on each new page so the correct strip is visible (jsPDF clips to page).
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, imgH)
      let heightLeft = imgH - pdfH
      let position   = -pdfH
      while (heightLeft > 0) {
        pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, position, pdfW, imgH)
        heightLeft -= pdfH
        position   -= pdfH
      }

      const pdfBase64 = pdf.output('datauristring').split(',')[1]

      // ── 3. POST to API ──────────────────────────────────────────────
      setStatus('sending')

      const res = await fetch('/api/invoices/send-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pdfBase64, guestEmail, guestSurname, checkinStr, checkoutStr, invoiceRef }),
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
