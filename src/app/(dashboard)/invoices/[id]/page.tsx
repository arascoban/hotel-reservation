import { createClient } from '@/lib/supabase/server'
import { notFound }      from 'next/navigation'
import Image             from 'next/image'
import { format }        from 'date-fns'
import { de }            from 'date-fns/locale'
import PrintButton       from '../../reservations/[id]/print/PrintButton'

export const dynamic = 'force-dynamic'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number) { return String(n).padStart(6, '0') }
function eur(n: number)    {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

const BREAKFAST_VAT = 0.07
const SERVICE_VAT   = 0.19

const PAY_LABELS: Record<string, string> = {
  cash:        'Bar',
  ec_card:     'EC-Karte',
  credit_card: 'Kreditkarte',
  online:      'Online',
  unpaid:      'Ausstehend',
}

interface ServiceItem {
  name: string; qty: number; unit_price: number; total: number
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function InvoicePrintPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data } = await supabase.from('invoices').select('*').eq('id', params.id).single()
  if (!data) notFound()

  const inv = data as any

  const checkin     = new Date(inv.checkin_at)
  const checkout    = new Date(inv.checkout_at)
  const invoiceDate = new Date(inv.created_at)

  const guestCount         = (inv.guest_count            ?? 1)     as number
  const nights             = (inv.nights                 ?? 1)     as number
  const breakfastPPP       = (inv.breakfast_price_per_person ?? 10) as number
  const hasBreakfast       = !!inv.breakfast_included
  const serviceItems: ServiceItem[] = Array.isArray(inv.room_service_items) ? inv.room_service_items : []
  const serviceTotal       = (inv.room_service_total     ?? 0)     as number
  const totalPrice         = (inv.total_price            ?? 0)     as number

  const breakfastGross     = hasBreakfast ? guestCount * nights * breakfastPPP : 0
  const accommodationGross = totalPrice - breakfastGross
  const grandTotal         = totalPrice + serviceTotal
  const pricePerNight      = nights > 0 ? accommodationGross / nights : accommodationGross

  const acc_net   = accommodationGross / (1 + BREAKFAST_VAT)
  const bfst_net  = breakfastGross     / (1 + BREAKFAST_VAT)
  const svc_net   = serviceTotal > 0   ? serviceTotal / (1 + SERVICE_VAT) : 0
  const sumNetto  = acc_net + bfst_net + svc_net
  const vat7      = (accommodationGross - acc_net) + (breakfastGross - bfst_net)
  const vat19     = serviceTotal - svc_net
  const sumBrutto = grandTotal

  // Parse guest address into lines
  const addressLines = (inv.guest_address ?? '').split('\n').filter(Boolean) as string[]

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          aside, nav, header { display: none !important; }
          .lg\\:ml-64,[class*="ml-64"] { margin-left: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { margin: 0; size: A4 portrait; }
          body  { background: white !important; margin: 0 !important; }
          .print-outer { background: white !important; padding: 0 !important; }
          .page {
            width: 210mm !important;
            min-height: 297mm !important;
            padding: 15mm !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
          }
        }
        body { background: #e2e8f0; }
      `}</style>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="no-print flex items-center gap-3 px-6 pt-5 pb-3 bg-white border-b border-slate-200 sticky top-0 z-10">
        <PrintButton />
        <a href="/invoices" className="text-sm text-slate-500 hover:text-slate-700">← Rechnungen</a>
        <span className="ml-auto text-xs text-slate-400">Rechnung {fmtNum(inv.invoice_number)}</span>
      </div>

      {/* ── A4 document ─────────────────────────────────────────────────────── */}
      <div className="print-outer py-8 px-4">
        <div className="page bg-white shadow-2xl mx-auto flex flex-col"
             style={{ width: '794px', minHeight: '1123px', padding: '56px' }}>

          {/* ══ SECTION 1: Logo (left) + Company block (right) ════════════════ */}
          <div className="flex items-start justify-between mb-5">

            {/* Left: logo */}
            <div className="flex-shrink-0">
              <div className="bg-slate-800 rounded-xl px-4 py-3 inline-block">
                <Image
                  src="/logo.png"
                  alt="Jägerstieg Hotel & Pension"
                  width={140} height={70}
                  className="object-contain"
                />
              </div>
            </div>

            {/* Right: full company info — right-aligned */}
            <div className="text-right text-sm leading-relaxed">
              <p className="font-bold text-slate-900">Hotel-Pension Jägerstieg</p>
              <p className="text-slate-600">Verwaltung und Vertrieb G. Cetin Holding GmbH</p>
              <p className="text-slate-600">Von Eichendorf-Str. 16</p>
              <p className="text-slate-600">37539 Bad Grund</p>
              <p className="mt-2 text-slate-500">Telefon: +49 5327 2828</p>
              <p className="text-slate-500">E-Mail: info@jaegerstieg.de</p>
              <p className="mt-2 text-slate-600 font-medium">CEO: A. Eddie Çetin</p>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t-2 border-slate-800 mb-6" />

          {/* ══ SECTION 2: Guest address (left) + RECHNUNG block (right) ══════ */}
          <div className="flex items-start justify-between mb-8">

            {/* Left: guest address */}
            <div className="text-sm leading-relaxed">
              {/* Small sender line above address (like a window envelope) */}
              <p className="text-xs text-slate-400 mb-2 border-b border-slate-200 pb-1">
                Hotel-Pension Jägerstieg · Von Eichendorf-Str. 16 · 37539 Bad Grund
              </p>
              <p className="font-semibold text-slate-900">{inv.guest_name}</p>
              {inv.guest_email && <p className="text-slate-500">{inv.guest_email}</p>}
              {addressLines.map((line: string, i: number) => (
                <p key={i} className="text-slate-600">{line}</p>
              ))}
            </div>

            {/* Right: RECHNUNG header */}
            <div className="text-right">
              <p className="text-4xl font-black text-slate-900 tracking-tight mb-2">RECHNUNG</p>
              <p className="text-sm text-slate-500">
                Datum:{' '}
                <strong className="text-slate-700">
                  {format(invoiceDate, 'dd.MM.yyyy')}
                </strong>
              </p>
              <p className="text-sm text-slate-500 mt-0.5">
                Rechnungsnummer:{' '}
                <strong className="text-slate-700 font-mono">{fmtNum(inv.invoice_number)}</strong>
              </p>
            </div>
          </div>

          {/* ══ STAY INFO BAR ══════════════════════════════════════════════════ */}
          <div className="rounded-xl bg-slate-800 text-white px-6 py-4 mb-7 grid grid-cols-4 gap-4 text-center text-sm">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Zimmer</p>
              <p className="font-bold">{inv.room_name}</p>
              <p className="text-xs text-slate-400">Nr. {inv.room_number}</p>
            </div>
            <div className="border-x border-slate-700 px-3">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Anreise</p>
              <p className="font-bold">{format(checkin, 'dd.MM.yyyy')}</p>
              <p className="text-xs text-slate-400">{format(checkin, 'HH:mm')} Uhr</p>
            </div>
            <div className="border-r border-slate-700 pr-3">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Abreise</p>
              <p className="font-bold">{format(checkout, 'dd.MM.yyyy')}</p>
              <p className="text-xs text-slate-400">{format(checkout, 'HH:mm')} Uhr</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Nächte</p>
              <p className="font-black text-2xl leading-none">{nights}</p>
              {inv.early_departure && inv.original_nights && (
                <p className="text-xs text-amber-400 mt-0.5">von {inv.original_nights} geplant</p>
              )}
            </div>
          </div>

          {/* ══ EARLY DEPARTURE WARNING ════════════════════════════════════════ */}
          {inv.early_departure && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 px-4 py-3 mb-6 flex items-center gap-3">
              <span>⚠️</span>
              <div>
                <p className="text-sm font-bold text-amber-800">Vorzeitige Abreise</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Ursprünglich {inv.original_nights} Nacht{inv.original_nights !== 1 ? 'e' : ''} gebucht
                  {inv.original_price != null && ` (${eur(inv.original_price)})`}.
                  Tatsächlich {nights} Nacht{nights !== 1 ? 'e' : ''} geblieben.
                </p>
              </div>
            </div>
          )}

          {/* ══ LINE ITEMS TABLE ═══════════════════════════════════════════════ */}
          <table className="w-full text-sm mb-6 border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white text-xs uppercase tracking-wide">
                <th className="px-3 py-2.5 text-left font-semibold rounded-tl-lg w-8">Pos.</th>
                <th className="px-3 py-2.5 text-left font-semibold">Beschreibung</th>
                <th className="px-3 py-2.5 text-center font-semibold w-12">Anz.</th>
                <th className="px-3 py-2.5 text-right font-semibold w-28">Einzelpreis</th>
                <th className="px-3 py-2.5 text-center font-semibold w-16">MwSt.</th>
                <th className="px-3 py-2.5 text-right font-semibold w-28">Gesamt Netto</th>
                <th className="px-3 py-2.5 text-right font-semibold rounded-tr-lg w-28">Gesamt Brutto</th>
              </tr>
            </thead>
            <tbody>

              {/* ── Pos 1: Übernachtung ── */}
              <tr className="border-b border-slate-100">
                <td className="px-3 py-3 text-slate-400 text-xs align-top">1</td>
                <td className="px-3 py-3 text-slate-800 align-top">
                  <span className="font-medium">Übernachtung</span>
                  <span className="block text-xs text-slate-400 mt-0.5">
                    {inv.room_name} (Zi. {inv.room_number}) ·{' '}
                    {format(checkin, 'dd.MM.')}–{format(checkout, 'dd.MM.yyyy')}
                  </span>
                  <span className="block text-xs text-slate-400">
                    Für {guestCount} Person{guestCount !== 1 ? 'en' : ''}
                  </span>
                  {inv.early_departure && (
                    <span className="inline-block mt-1 text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
                      Vorzeitige Abreise
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-center text-slate-600 align-top">{nights}</td>
                <td className="px-3 py-3 text-right text-slate-600 align-top">{eur(pricePerNight)}</td>
                <td className="px-3 py-3 text-center text-slate-500 text-xs align-top">7 %</td>
                <td className="px-3 py-3 text-right text-slate-600 align-top">{eur(acc_net)}</td>
                <td className="px-3 py-3 text-right font-semibold text-slate-800 align-top">{eur(accommodationGross)}</td>
              </tr>

              {/* ── Pos 2: Frühstück ── */}
              {hasBreakfast && (
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-3 text-slate-400 text-xs align-top">2</td>
                  <td className="px-3 py-3 text-slate-800 align-top">
                    <span className="font-medium">Frühstück</span>
                    <span className="block text-xs text-slate-400 mt-0.5">
                      {guestCount} Person{guestCount !== 1 ? 'en' : ''} × {nights} Nacht{nights !== 1 ? 'e' : ''}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-slate-600 align-top">{guestCount * nights}</td>
                  <td className="px-3 py-3 text-right text-slate-600 align-top">{eur(breakfastPPP)}</td>
                  <td className="px-3 py-3 text-center text-slate-500 text-xs align-top">7 %</td>
                  <td className="px-3 py-3 text-right text-slate-600 align-top">{eur(bfst_net)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-800 align-top">{eur(breakfastGross)}</td>
                </tr>
              )}

              {/* ── Pos 3: Zimmerservice ── */}
              {serviceTotal > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-3 text-slate-400 text-xs align-top">{hasBreakfast ? 3 : 2}</td>
                  <td className="px-3 py-3 text-slate-800 align-top">
                    <span className="font-medium">Zimmerservice</span>
                    {serviceItems.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {serviceItems.map((item, i) => (
                          <li key={i} className="text-xs text-slate-500">
                            {item.name}{item.qty > 1 ? ` × ${item.qty}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center text-slate-400 text-xs align-top">—</td>
                  <td className="px-3 py-3 text-right text-slate-400 text-xs align-top">—</td>
                  <td className="px-3 py-3 text-center text-slate-500 text-xs align-top">19 %</td>
                  <td className="px-3 py-3 text-right text-slate-600 align-top">{eur(svc_net)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-800 align-top">{eur(serviceTotal)}</td>
                </tr>
              )}

            </tbody>
          </table>

          {/* ══ TOTALS + PAYMENT ══════════════════════════════════════════════ */}
          <div className="flex items-start justify-between mb-8 gap-6">

            {/* Left: booking reference / notes */}
            <div className="text-xs text-slate-400 space-y-1 flex-1 pt-1">
              {inv.notes && <p className="text-slate-600 text-sm">{inv.notes}</p>}
            </div>

            {/* Right: totals */}
            <div className="w-72 flex-shrink-0">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 text-slate-500">Summe Netto</td>
                    <td className="py-2 text-right font-medium text-slate-700">{eur(sumNetto)}</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 text-slate-500">MwSt. 7 %</td>
                    <td className="py-2 text-right font-medium text-slate-700">{eur(vat7)}</td>
                  </tr>
                  {serviceTotal > 0 && (
                    <tr className="border-b border-slate-100">
                      <td className="py-2 text-slate-500">MwSt. 19 %</td>
                      <td className="py-2 text-right font-medium text-slate-700">{eur(vat19)}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={2} className="pt-1 pb-0">
                      <div className="flex justify-between items-center bg-slate-800 text-white px-4 py-3 rounded-lg">
                        <span className="font-bold">Summe Brutto</span>
                        <span className="font-black text-lg">{eur(sumBrutto)}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Payment method */}
              <div className="mt-3 flex justify-between items-center px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm">
                <span className="text-slate-500">Zahlungsart</span>
                <span className="font-semibold text-slate-800">
                  {PAY_LABELS[inv.payment_method] ?? inv.payment_method}
                </span>
              </div>
            </div>
          </div>

          {/* ══ SPACER ════════════════════════════════════════════════════════ */}
          <div className="flex-1" />

          {/* ══ FOOTER ════════════════════════════════════════════════════════ */}
          <div className="border-t border-slate-200 pt-6 mt-4">
            <p className="text-sm text-slate-700 mb-6">Zahlung nach Rechnungserhalt.</p>

            {/* Signature area */}
            <div className="flex items-end justify-between">
              <div>
                {/* Cursive-style CEO name */}
                <p className="text-2xl text-slate-700 mb-0.5" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                  A. Eddie Çetin
                </p>
                <p className="text-xs text-slate-500">Geschäftsführer</p>
              </div>

              {/* Right: hotel footer info */}
              <div className="text-right text-xs text-slate-400">
                <p>Rechnung Nr. {fmtNum(inv.invoice_number)}</p>
                <p className="mt-0.5">
                  Datum: {format(invoiceDate, 'd. MMMM yyyy', { locale: de })}
                </p>
                <p className="mt-1">Jägerstieg Hotel &amp; Pension · info@jaegerstieg.de</p>
              </div>
            </div>

            <p className="text-center text-xs text-slate-300 mt-5 border-t border-slate-100 pt-3">
              Vielen Dank für Ihren Aufenthalt! · Alle Preise inkl. MwSt.
            </p>
          </div>

        </div>
      </div>
    </>
  )
}
