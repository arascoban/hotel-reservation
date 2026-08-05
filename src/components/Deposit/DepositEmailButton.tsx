'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { captureInvoicePdf } from '@/lib/pdfCapture'

interface Props {
  /** Exactly one of these. Invoice wins when both are somehow present. */
  reservationId?: string
  invoiceId?:     string
  /** Capture the rendered invoice and attach it (invoice page only). */
  captureInvoice?: boolean
  /** Already sent once — button stays usable but shows when it last went out. */
  sentAt?: string | null
  disabled?: boolean
  disabledReason?: string
  className?: string
}

type Status = 'idle' | 'generating' | 'sending' | 'success' | 'error'

/**
 * Sends the deposit thank-you e-mail — only on an explicit click, never
 * automatically. On the invoice page it first captures the rendered invoice
 * so the guest receives the exact document they see; elsewhere the server
 * generates a Buchungsbestätigung.
 */
export default function DepositEmailButton({
  reservationId, invoiceId, captureInvoice = false,
  sentAt, disabled = false, disabledReason, className,
}: Props) {
  const router = useRouter()
  const [status,  setStatus]  = useState<Status>('idle')
  const [errMsg,  setErrMsg]  = useState('')
  const [confirm, setConfirm] = useState(false)

  async function send() {
    setConfirm(false)
    try {
      let pdfBase64: string | undefined

      if (captureInvoice) {
        setStatus('generating')
        pdfBase64 = await captureInvoicePdf()
      }

      // ── Send ─────────────────────────────────────────────────────────────
      setStatus('sending')
      const res = await fetch('/api/deposit/send-confirmation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reservationId, invoiceId, pdfBase64 }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error ?? 'Fehler beim Senden')
      }

      setStatus('success')
      router.refresh()
      setTimeout(() => setStatus('idle'), 5000)
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Unbekannter Fehler')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 7000)
    }
  }

  const busy = status === 'generating' || status === 'sending'

  if (disabled) {
    return (
      <span className={cn('text-xs text-slate-400', className)} title={disabledReason}>
        {disabledReason ?? 'Zahlungsbestätigung nicht verfügbar'}
      </span>
    )
  }

  // Confirm step — sending an e-mail to a guest should never be a stray click
  if (confirm) {
    return (
      <span className={cn('flex items-center gap-1.5 flex-wrap', className)}>
        <button onClick={send} disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 transition-colors">
          <Send className="w-4 h-4" />
          Jetzt an Gast senden
        </button>
        <button onClick={() => setConfirm(false)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          Abbrechen
        </button>
      </span>
    )
  }

  return (
    <span className={cn('inline-flex flex-col gap-1', className)}>
      <button
        onClick={() => setConfirm(true)}
        disabled={busy}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
          status === 'success' ? 'border-green-300 bg-green-50 text-green-700'
          : status === 'error' ? 'border-red-300 bg-red-50 text-red-700'
          : 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100',
          busy && 'cursor-not-allowed opacity-60',
        )}
      >
        {busy            ? <Loader2 className="w-4 h-4 animate-spin" />
         : status === 'success' ? <CheckCircle className="w-4 h-4" />
         : status === 'error'   ? <AlertCircle className="w-4 h-4" />
         : <Send className="w-4 h-4" />}

        {status === 'generating' ? 'PDF erstellen…'
         : status === 'sending'  ? 'Sende…'
         : status === 'success'  ? 'Gesendet!'
         : status === 'error'    ? `Fehler: ${errMsg.slice(0, 45)}`
         : 'Zahlungsbestätigung senden'}
      </button>

      {sentAt && status === 'idle' && (
        <span className="text-xs text-slate-400">
          Zuletzt gesendet: {new Date(sentAt).toLocaleDateString('de-DE')}
        </span>
      )}
    </span>
  )
}
