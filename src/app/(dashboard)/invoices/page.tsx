'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { FileText, Settings, ChevronRight, Hash } from 'lucide-react'
import { useAdmin } from '@/hooks/useAdmin'
import { cn } from '@/lib/cn'
import Link from 'next/link'

interface Invoice {
  id: string
  invoice_number: number
  guest_name: string
  guest_email: string | null
  room_number: string
  room_name: string
  checkin_at: string
  checkout_at: string
  nights: number
  total_price: number
  payment_method: string
  created_at: string
  created_by: string | null
}

const PAY_LABELS: Record<string, string> = {
  cash: 'Bargeld', ec_card: 'EC-Karte', credit_card: 'Kreditkarte', online: 'Online',
}

function fmtNum(n: number) { return String(n).padStart(6, '0') }

export default function InvoicesPage() {
  const supabase = createClient()
  const { isAdmin } = useAdmin()

  const [invoices,    setInvoices]    = useState<Invoice[]>([])
  const [loading,     setLoading]     = useState(true)
  const [nextNumber,  setNextNumber]  = useState<number>(1)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsVal, setSettingsVal] = useState('')
  const [saving,      setSaving]      = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: inv }, { data: settings }] = await Promise.all([
      supabase.from('invoices').select('*').order('invoice_number', { ascending: false }),
      supabase.from('invoice_settings').select('next_number').eq('id', 1).single(),
    ])
    setInvoices((inv ?? []) as Invoice[])
    if (settings) setNextNumber(settings.next_number)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function saveSettings() {
    const num = parseInt(settingsVal)
    if (isNaN(num) || num < 1) return
    setSaving(true)
    await supabase.from('invoice_settings').update({
      next_number: num,
      updated_by: (await supabase.auth.getUser()).data.user?.email ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
    setNextNumber(num)
    setShowSettings(false)
    setSaving(false)
  }

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-slate-500" />
            Rechnungen
          </h1>
          <p className="text-slate-500 mt-1">
            {invoices.length} Rechnung{invoices.length !== 1 ? 'en' : ''} · Nächste Nr.: <span className="font-mono font-semibold">{fmtNum(nextNumber)}</span>
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setSettingsVal(String(nextNumber)); setShowSettings(true) }}
            className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Rechnungsnummer
          </button>
        )}
      </div>

      {/* Admin: change next invoice number */}
      {showSettings && isAdmin && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4 flex-wrap">
          <Hash className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Nächste Rechnungsnummer setzen</p>
            <p className="text-xs text-amber-600 mt-0.5">Ändert die Startnummer für neue Rechnungen. Bereits erstellte Rechnungen bleiben unverändert.</p>
          </div>
          <input
            type="number"
            min={1}
            value={settingsVal}
            onChange={e => setSettingsVal(e.target.value)}
            className="w-28 border border-amber-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            placeholder="z.B. 100"
          />
          <button
            onClick={saveSettings}
            disabled={saving}
            className="rounded-lg bg-amber-600 text-white px-4 py-1.5 text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
          <button
            onClick={() => setShowSettings(false)}
            className="text-amber-500 hover:text-amber-700 text-sm"
          >
            Abbrechen
          </button>
        </div>
      )}

      {/* Invoice list */}
      {loading ? (
        <div className="text-center py-20 text-slate-400 text-sm">Lädt…</div>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-16 text-center">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Noch keine Rechnungen erstellt.</p>
          <p className="text-slate-400 text-xs mt-1">Rechnungen werden beim Auschecken von Gästen erstellt.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Nr.</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Gast</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Zimmer</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Abreise</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Zahlung</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-600">Betrag</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Erstellt</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-slate-900">{fmtNum(inv.invoice_number)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{inv.guest_name}</div>
                      {inv.guest_email && <div className="text-xs text-slate-400">{inv.guest_email}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="font-semibold">Zi. {inv.room_number}</span>
                      <span className="ml-1 text-xs text-slate-400 hidden sm:inline">{inv.room_name}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {format(new Date(inv.checkout_at), 'd. MMM yyyy', { locale: de })}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {PAY_LABELS[inv.payment_method] ?? inv.payment_method}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      €{inv.total_price.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {format(new Date(inv.created_at), 'd. MMM yyyy', { locale: de })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/invoices/${inv.id}`}
                        target="_blank"
                        className={cn(
                          'inline-flex items-center gap-1 rounded-lg border border-slate-300',
                          'px-2.5 py-1.5 text-xs font-medium text-slate-600',
                          'hover:bg-slate-50 transition-colors',
                        )}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Anzeigen
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
