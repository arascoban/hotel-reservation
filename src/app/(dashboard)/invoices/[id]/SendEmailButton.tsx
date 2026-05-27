'use client'

import { useState } from 'react'
import { Mail, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface Props {
  invoiceRef:   string        // e.g. "R26_001"
  guestEmail:   string | null
  salutation:   string | null // 'Herr' | 'Frau' | null
  guestSurname: string
  checkinStr:   string        // e.g. "15.05.2026"
  checkoutStr:  string
}

type Status = 'idle' | 'generating' | 'sending' | 'success' | 'error'

export default function SendEmailButton({
  invoiceRef,
  guestEmail,
  salutation,
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

      // ── 1b. Pre-fetch logo as data URL ─────────────────────────────
      // The logo is WHITE on a transparent background. html2canvas renders
      // transparent areas as white, making the logo invisible on its
      // internal white canvas. Fix: fetch it separately and overlay it
      // directly onto the PDF after the canvas capture.
      let logoDataUrl = ''
      try {
        const blob = await fetch('/logo.png').then(r => r.blob())
        logoDataUrl = await new Promise<string>((resolve, reject) => {
          const reader  = new FileReader()
          reader.onload  = e  => resolve(e.target!.result as string)
          reader.onerror = () => reject()
          reader.readAsDataURL(blob)
        })
      } catch { /* non-fatal */ }

      // ── 2. Capture page (logo area will be dark box, no logo yet) ──
      const canvas = await html2canvas(pageEl, {
        scale:           2,
        useCORS:         true,
        allowTaint:      false,
        backgroundColor: '#ffffff',
        logging:         false,
        imageTimeout:    0,
      })

      // ── 3. Build the PDF — single A4 page ──────────────────────────
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const pdf     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfW    = pdf.internal.pageSize.getWidth()   // 210 mm
      const pdfH    = pdf.internal.pageSize.getHeight()  // 297 mm
      const imgH    = (canvas.height / canvas.width) * pdfW
      const finalH  = Math.min(imgH, pdfH)
      const finalW  = pdfW * (finalH / imgH)
      pdf.addImage(imgData, 'JPEG', 0, 0, finalW, finalH)

      // ── 4. Overlay logo directly onto the PDF ──────────────────────
      // The page has 34px padding; the dark logo box has px-4 (16px) / py-3 (12px)
      // padding. Scale: 210mm / 794px = 0.2644 mm/px. Logo: 150×72 CSS px.
      // Coordinates (mm): x=(34+16)×0.2644=13.2, y=(34+12)×0.2644=12.2
      // Size (mm): 150×0.2644=39.7 wide, 72×0.2644=19.0 tall
      if (logoDataUrl) {
        const s = finalW / pdfW          // scale factor (≈1 for A4 invoice)
        pdf.addImage(logoDataUrl, 'PNG', 13.2 * s, 12.2 * s, 39.7 * s, 19.0 * s)
      }

      const pdfBase64 = pdf.output('datauristring').split(',')[1]

      // ── 3. POST to API ──────────────────────────────────────────────
      setStatus('sending')

      const res = await fetch('/api/invoices/send-email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pdfBase64, guestEmail, salutation, guestSurname, checkinStr, checkoutStr, invoiceRef }),
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
