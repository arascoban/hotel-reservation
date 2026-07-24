'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Ban, RotateCcw, Loader2 } from 'lucide-react'

interface Props {
  invoiceId: string
  cancelled: boolean   // true when the invoice is already storniert
}

/**
 * Toolbar toggle for cancelling / re-activating an invoice.
 * Cancelling is soft — the invoice (and its number) is kept for records,
 * it is only marked "STORNIERT". Re-activation is available to undo mistakes.
 */
export default function StornoButton({ invoiceId, cancelled }: Props) {
  const router   = useRouter()
  const supabase = createClient()
  const [busy,    setBusy]    = useState(false)
  const [confirm, setConfirm] = useState(false)

  async function toggle() {
    setBusy(true)
    if (cancelled) {
      await supabase.from('invoices')
        .update({ cancelled_at: null, cancelled_by: null })
        .eq('id', invoiceId)
    } else {
      const email = (await supabase.auth.getUser()).data.user?.email ?? null
      await supabase.from('invoices')
        .update({ cancelled_at: new Date().toISOString(), cancelled_by: email })
        .eq('id', invoiceId)
    }
    setBusy(false)
    setConfirm(false)
    router.refresh()
  }

  // Already cancelled → offer to undo
  if (cancelled) {
    return (
      <button
        onClick={toggle}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
        Storno aufheben
      </button>
    )
  }

  // Confirm step before cancelling
  if (confirm) {
    return (
      <span className="flex items-center gap-1.5">
        <button
          onClick={toggle}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
          Wirklich stornieren?
        </button>
        <button
          onClick={() => setConfirm(false)}
          disabled={busy}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Abbrechen
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
    >
      <Ban className="w-4 h-4" />
      Stornieren
    </button>
  )
}
