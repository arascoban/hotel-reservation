import { createClient } from '@/lib/supabase/server'
import { notFound }      from 'next/navigation'
import Image             from 'next/image'
import { format }        from 'date-fns'
import { de }            from 'date-fns/locale'
import PrintButton       from '../../reservations/[id]/print/PrintButton'

export const dynamic = 'force-dynamic'

function fmtNum(n: number)      { return String(n).padStart(6, '0') }
function eur(n: number)         { return `€ ${n.toFixed(2)}` }

const PAY_LABELS: Record<string, string> = {
  cash: 'Bargeld', ec_card: 'EC-Karte', credit_card: 'Kreditkarte', online: 'Online',
}

const VAT_RATE = 0.07   // 7% reduced rate for German hotel accommodation

export default async function InvoicePrintPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data } = await supabase.from('invoices').select('*').eq('id', params.id).single()
  if (!data) notFound()

  const inv         = data
  const checkin     = new Date(inv.checkin_at)
  const checkout    = new Date(inv.checkout_at)
  const gross       = inv.total_price as number
  const vat         = gross * VAT_RATE / (1 + VAT_RATE)
  const net         = gross - vat
  const pricePerNight = inv.nights > 0 ? gross / inv.nights : gross

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          aside, nav, header { display: none !important; }
          .lg\\:ml-64,[class*="ml-64"] { margin-left: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { margin: 15mm; size: A4 portrait; }
          body  { background: white !important; margin: 0 !important; }
          .page { box-shadow: none !important; border: none !important; min-height: 0 !important; }
        }
        body { background: #e2e8f0; }
      `}</style>

      {/* Toolbar */}
      <div className="no-print flex items-center gap-3 px-6 pt-5 pb-3 bg-white border-b border-slate-200 sticky top-0 z-10">
        <PrintButton />
        <a href="/invoices" className="text-sm text-slate-500 hover:text-slate-700">← Rechnungen</a>
        <span className="ml-auto text-xs text-slate-400">Rechnung {fmtNum(inv.invoice_number)}</span>
      </div>

      {/* A4 paper shell */}
      <div className="py-8 px-4">
        <div className="page bg-white shadow-2xl mx-auto flex flex-col"
             style={{ width: '210mm', minHeight: '297mm', padding: '15mm' }}>

          {/* ── HEADER ──────────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between pb-6 border-b-2 border-slate-800 mb-6">
            <div className="bg-slate-800 rounded-xl px-4 py-2.5">
              <Image src="/logo.png" alt="Jägerstieg Hotel & Pension" width={130} height={65} className="object-contain" />
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Rechnung</p>
              <p className="text-4xl font-black text-slate-900 font-mono tracking-wide leading-none">{fmtNum(inv.invoice_number)}</p>
              <p className="text-sm text-slate-500 mt-2">
                Datum: <strong>{format(new Date(inv.created_at), 'd. MMMM yyyy', { locale: de })}</strong>
              </p>
            </div>
          </div>

          {/* ── ADDRESSES ───────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Rechnungssteller</p>
              <p className="font-bold text-slate-900 text-sm">Jägerstieg Hotel &amp; Pension</p>
              <p className="text-sm text-slate-600 mt-0.5">info@jaegerstieg.de</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Rechnungsempfänger</p>
              <p className="font-bold text-slate-900 text-sm">{inv.guest_name}</p>
              {inv.guest_email && <p className="text-sm text-slate-600 mt-0.5">{inv.guest_email}</p>}
              {inv.guest_address && (
                <p className="text-sm text-slate-600 whitespace-pre-wrap mt-0.5">{inv.guest_address}</p>
              )}
            </div>
          </div>

          {/* ── STAY BANNER ─────────────────────────────────────────────────── */}
          <div className="rounded-xl bg-slate-800 text-white px-6 py-4 mb-6 grid grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Zimmer</p>
              <p className="font-bold text-sm">{inv.room_name}</p>
              <p className="text-xs text-slate-400">Nr. {inv.room_number}</p>
            </div>
            <div className="border-x border-slate-700 px-4">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Anreise</p>
              <p className="font-bold text-sm">{format(checkin, 'dd.MM.yyyy')}</p>
              <p className="text-xs text-slate-400">{format(checkin, 'HH:mm')} Uhr</p>
            </div>
            <div className="border-r border-slate-700 pr-4">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Abreise</p>
              <p className="font-bold text-sm">{format(checkout, 'dd.MM.yyyy')}</p>
              <p className="text-xs text-slate-400">{format(checkout, 'HH:mm')} Uhr</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Nächte</p>
              <p className="font-black text-2xl">{inv.nights}</p>
              {inv.early_departure && inv.original_nights && (
                <p className="text-xs text-amber-400">von {inv.original_nights} geplant</p>
              )}
            </div>
          </div>

          {/* ── EARLY DEPARTURE WARNING ──────────────────────────────────────── */}
          {inv.early_departure && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 px-4 py-3 mb-6 flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="text-sm font-bold text-amber-800">Vorzeitige Abreise</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Ursprünglich {inv.original_nights} Nacht{inv.original_nights !== 1 ? 'e' : ''} gebucht
                  {inv.original_price != null && ` (€${(inv.original_price as number).toFixed(2)})`}.
                  Tatsächlich {inv.nights} Nacht{inv.nights !== 1 ? 'e' : ''} geblieben.
                </p>
              </div>
            </div>
          )}

          {/* ── LINE ITEMS ───────────────────────────────────────────────────── */}
          <table className="w-full text-sm mb-6 border border-slate-200 rounded-xl overflow-hidden">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Leistung</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700 w-20">Menge</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700 w-28">Einzelpreis</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700 w-28">Gesamt</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="px-4 py-3 text-slate-800">
                  Übernachtung · {inv.room_name} (Zi. {inv.room_number})
                  {inv.early_departure && (
                    <span className="ml-2 text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 font-medium">
                      Vorzeitige Abreise
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-slate-600">{inv.nights}</td>
                <td className="px-4 py-3 text-right text-slate-600">{eur(pricePerNight)}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800">{eur(gross)}</td>
              </tr>
              {inv.breakfast_included && (
                <tr className="border-b border-slate-100">
                  <td className="px-4 py-3 text-slate-600">☕ Frühstück</td>
                  <td className="px-4 py-3 text-center text-slate-500">{inv.nights}</td>
                  <td className="px-4 py-3 text-right text-slate-500">—</td>
                  <td className="px-4 py-3 text-right text-slate-500">inklusive</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* ── TOTALS + PAYMENT ─────────────────────────────────────────────── */}
          <div className="flex justify-end mb-6">
            <div className="w-72">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex justify-between px-4 py-2.5 text-sm border-b border-slate-100">
                  <span className="text-slate-500">Nettobetrag (ohne MwSt.)</span>
                  <span className="font-medium text-slate-700">{eur(net)}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5 text-sm border-b border-slate-100">
                  <span className="text-slate-500">7% MwSt. (enthaltener Anteil)</span>
                  <span className="font-medium text-slate-700">{eur(vat)}</span>
                </div>
                <div className="flex justify-between px-4 py-3.5 bg-slate-800 text-white">
                  <span className="font-bold text-sm">Gesamtbetrag (brutto)</span>
                  <span className="font-black text-lg">{eur(gross)}</span>
                </div>
              </div>

              {/* Payment badge */}
              <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-green-600 uppercase tracking-wide">Bezahlt</p>
                  <p className="text-sm font-semibold text-green-800">{PAY_LABELS[inv.payment_method] ?? inv.payment_method}</p>
                </div>
                <span className="text-2xl">✅</span>
              </div>
            </div>
          </div>

          {/* ── NOTES ───────────────────────────────────────────────────────── */}
          {inv.notes && (
            <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3 mb-6">
              <p className="text-xs font-bold uppercase tracking-wide text-yellow-700 mb-1">Hinweise</p>
              <p className="text-sm text-slate-700">{inv.notes}</p>
            </div>
          )}

          {/* ── SPACER (pushes footer to bottom) ─────────────────────────────── */}
          <div className="flex-1" />

          {/* ── FOOTER ──────────────────────────────────────────────────────── */}
          <div className="border-t-2 border-slate-200 pt-4 mt-4">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <div>
                <p className="font-semibold text-slate-600">Jägerstieg Hotel &amp; Pension</p>
                <p>info@jaegerstieg.de</p>
              </div>
              <div className="text-right">
                <p>Rechnung Nr. {fmtNum(inv.invoice_number)}</p>
                <p>Erstellt am {format(new Date(inv.created_at), 'd. MMMM yyyy', { locale: de })}</p>
              </div>
            </div>
            <p className="text-center text-xs text-slate-300 mt-3 border-t border-slate-100 pt-3">
              Vielen Dank für Ihren Aufenthalt! · Alle Preise sind Bruttopreise inkl. 7% MwSt.
            </p>
          </div>

        </div>
      </div>
    </>
  )
}
