import { createClient } from '@/lib/supabase/server'
import { notFound }      from 'next/navigation'
import Image             from 'next/image'
import { format }        from 'date-fns'
import { de }            from 'date-fns/locale'
import PrintButton       from '../../reservations/[id]/print/PrintButton'

export const dynamic = 'force-dynamic'

function fmtNum(n: number) { return String(n).padStart(6, '0') }

const PAY_LABELS: Record<string, string> = {
  cash: 'Bargeld', ec_card: 'EC-Karte', credit_card: 'Kreditkarte', online: 'Online',
}

export default async function InvoicePrintPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!data) notFound()
  const inv = data

  const checkin  = new Date(inv.checkin_at)
  const checkout = new Date(inv.checkout_at)

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          aside, nav, header { display: none !important; }
          .lg\\:ml-64, [class*="ml-64"] { margin-left: 0 !important; }
          .print-doc { min-height: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { margin: 12mm; size: A4 portrait; }
          body { background: white !important; font-size: 12px; margin: 0 !important; }
        }
        body { background: #f8fafc; }
      `}</style>

      {/* Toolbar */}
      <div className="no-print flex items-center gap-3 px-6 pt-5 pb-3 bg-white border-b border-slate-200">
        <PrintButton />
        <a href="/invoices" className="text-sm text-slate-500 hover:text-slate-700">← Rechnungen</a>
      </div>

      {/* Invoice document */}
      <div className="print-doc max-w-xl mx-auto px-8 py-8 bg-white">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 pb-5 border-b-2 border-slate-200">
          <div className="bg-slate-800 rounded-xl px-5 py-2.5">
            <Image src="/logo.png" alt="Jägerstieg Hotel & Pension" width={120} height={60} className="object-contain" />
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">Rechnung</p>
            <p className="text-3xl font-black text-slate-900 font-mono tracking-wide">{fmtNum(inv.invoice_number)}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Datum: {format(new Date(inv.created_at), 'd. MMMM yyyy', { locale: de })}
            </p>
          </div>
        </div>

        {/* Hotel + guest info side by side */}
        <div className="grid grid-cols-2 gap-6 mb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">Rechnungssteller</p>
            <p className="font-semibold text-slate-900">Jägerstieg Hotel &amp; Pension</p>
            <p className="text-xs text-slate-500 mt-0.5">info@jaegerstieg.de</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">Rechnungsempfänger</p>
            <p className="font-semibold text-slate-900">{inv.guest_name}</p>
            {inv.guest_email   && <p className="text-xs text-slate-500 mt-0.5">{inv.guest_email}</p>}
            {inv.guest_address && (
              <p className="text-xs text-slate-500 whitespace-pre-wrap mt-0.5">{inv.guest_address}</p>
            )}
          </div>
        </div>

        {/* Stay summary box */}
        <div className="bg-blue-50 rounded-xl p-4 mb-5 flex items-center justify-between text-center gap-4">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-400 mb-1">Anreise</p>
            <p className="font-bold text-slate-900 text-sm">{format(checkin, 'dd.MM.yyyy', { locale: de })}</p>
            <p className="text-xs text-slate-500">{format(checkin, 'HH:mm', { locale: de })} Uhr</p>
          </div>
          <div className="flex-1 border-x border-blue-200 px-4">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-400 mb-1">Nächte</p>
            <p className="font-bold text-slate-900 text-2xl">{inv.nights}</p>
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-400 mb-1">Abreise</p>
            <p className="font-bold text-slate-900 text-sm">{format(checkout, 'dd.MM.yyyy', { locale: de })}</p>
            <p className="text-xs text-slate-500">{format(checkout, 'HH:mm', { locale: de })} Uhr</p>
          </div>
        </div>

        {/* Room info */}
        <div className="bg-slate-50 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-0.5">Zimmer</p>
            <p className="font-semibold text-slate-900">{inv.room_name}</p>
            <p className="text-xs text-slate-500">Zimmer-Nr. {inv.room_number}</p>
          </div>
          {inv.breakfast_included && (
            <span className="inline-flex rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-xs font-semibold">
              ☕ Frühstück inkl.
            </span>
          )}
        </div>

        {/* Line items */}
        <div className="rounded-xl border border-slate-200 mb-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Leistung</th>
                <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Menge</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Einzelpreis</th>
                <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Gesamt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-3 text-slate-800">
                  Übernachtung · {inv.room_name}
                  <span className="ml-1 text-slate-400 text-xs">(Zi. {inv.room_number})</span>
                </td>
                <td className="px-4 py-3 text-center text-slate-600">{inv.nights}</td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {inv.nights > 0
                    ? `€${(inv.total_price / inv.nights).toFixed(2)}`
                    : '—'}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">
                  €{inv.total_price.toFixed(2)}
                </td>
              </tr>
              {inv.breakfast_included && (
                <tr>
                  <td className="px-4 py-3 text-slate-600">☕ Frühstück (inklusive)</td>
                  <td className="px-4 py-3 text-center text-slate-500">{inv.nights}</td>
                  <td className="px-4 py-3 text-right text-slate-500">—</td>
                  <td className="px-4 py-3 text-right text-slate-500">inklusive</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td colSpan={3} className="px-4 py-3 text-right font-bold text-slate-900">Gesamtbetrag</td>
                <td className="px-4 py-3 text-right font-black text-xl text-blue-700">€{inv.total_price.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Payment confirmation */}
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-green-600 mb-0.5">Zahlungseingang</p>
            <p className="text-sm font-semibold text-green-800">Bezahlt · {PAY_LABELS[inv.payment_method] ?? inv.payment_method}</p>
          </div>
          <span className="text-2xl">✅</span>
        </div>

        {/* Notes */}
        {inv.notes && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-5">
            <p className="text-xs font-bold uppercase tracking-wide text-yellow-600 mb-1">Notizen</p>
            <p className="text-xs text-slate-700">{inv.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-200 pt-4 text-xs text-slate-400 text-center space-y-0.5">
          <p className="font-medium">Vielen Dank für Ihren Aufenthalt!</p>
          <p>Jägerstieg Hotel &amp; Pension · info@jaegerstieg.de</p>
          <p className="text-slate-300">Rechnung Nr. {fmtNum(inv.invoice_number)} · Erstellt am {format(new Date(inv.created_at), 'd. MMMM yyyy', { locale: de })}</p>
        </div>
      </div>
    </>
  )
}
