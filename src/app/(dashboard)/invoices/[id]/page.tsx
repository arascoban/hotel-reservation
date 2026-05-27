import { createClient } from '@/lib/supabase/server'
import { notFound }      from 'next/navigation'
import Image             from 'next/image'
import { format }        from 'date-fns'
import { de }            from 'date-fns/locale'
import PrintButton       from '../../reservations/[id]/print/PrintButton'

export const dynamic = 'force-dynamic'

function fmtNum(n: number, year?: number) {
  const y = (year ?? new Date().getFullYear()).toString().slice(-2)
  return `R${y}_${String(n).padStart(3, '0')}`
}
function eur(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

const BREAKFAST_VAT = 0.07
const SERVICE_VAT   = 0.19

const PAY_LABELS: Record<string, string> = {
  cash:        'Bar erhalten',
  ec_card:     'EC-Karte erhalten',
  credit_card: 'Kreditkarte erhalten',
  online:      'Online erhalten',
  unpaid:      'Ausstehend',
}

interface ServiceItem    { name: string; qty: number; unit_price: number; total: number }
interface CustomLineItem { id: string; description: string; qty: number; unit_price: number; vat_rate: 7 | 19 }

export default async function InvoicePrintPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data } = await supabase.from('invoices').select('*').eq('id', params.id).single()
  if (!data) notFound()

  const inv = data as any

  const checkin     = new Date(inv.checkin_at)
  const checkout    = new Date(inv.checkout_at)
  const invoiceDate = new Date(inv.created_at)

  const adultCount             = (inv.guest_count            ?? 1)  as number
  const childCount             = (inv.child_count             ?? 0)  as number
  const nights                 = (inv.nights                 ?? 1)  as number
  const breakfastPPP           = (inv.breakfast_price_per_person ?? 10) as number
  const hasBreakfast           = !!inv.breakfast_included
  const serviceItems: ServiceItem[]  = Array.isArray(inv.room_service_items) ? inv.room_service_items : []
  const serviceTotal                 = (inv.room_service_total ?? 0) as number
  const totalPrice                   = (inv.total_price ?? 0) as number
  const customItems: CustomLineItem[] = Array.isArray(inv.line_items) ? (inv.line_items as CustomLineItem[]) : []

  const custom7Gross  = customItems.filter(i => i.vat_rate === 7) .reduce((s, i) => s + i.qty * i.unit_price, 0)
  const custom19Gross = customItems.filter(i => i.vat_rate === 19).reduce((s, i) => s + i.qty * i.unit_price, 0)
  const custom7Net    = custom7Gross  > 0 ? custom7Gross  / 1.07 : 0
  const custom19Net   = custom19Gross > 0 ? custom19Gross / 1.19 : 0
  const customTotal   = custom7Gross + custom19Gross

  // Second room — calculated first so we can split its breakfast out correctly
  const room2Gross        = (inv.room2_total_price ?? 0) as number
  const hasRoom2          = room2Gross > 0 && !!inv.room2_number
  const room2CheckinDate  = inv.room2_checkin_at  ? new Date(inv.room2_checkin_at)  : checkin
  const room2CheckoutDate = inv.room2_checkout_at ? new Date(inv.room2_checkout_at) : checkout
  const room2NightsCalc    = inv.room2_checkin_at && inv.room2_checkout_at
    ? Math.max(1, Math.round((room2CheckoutDate.getTime() - room2CheckinDate.getTime()) / 86400000))
    : nights
  // Prefer the explicitly stored night count; fall back to date calculation
  const room2DisplayNights = ((inv.room2_nights ?? room2NightsCalc) || 1) as number
  const room2AdultCount    = (inv.room2_guest_count ?? adultCount) as number
  const room2ChildCountNum = (inv.room2_child_count ?? 0) as number
  const room2GuestLabel    = room2ChildCountNum > 0
    ? `${room2AdultCount} Erw. + ${room2ChildCountNum} Kind${room2ChildCountNum !== 1 ? 'er' : ''}`
    : `${room2AdultCount} Erw.`

  // Breakfast: extract from EACH room's gross price separately
  const room1BreakfastGross = hasBreakfast ? adultCount * nights * breakfastPPP : 0
  const room2BreakfastGross = hasRoom2 && hasBreakfast ? room2AdultCount * room2DisplayNights * breakfastPPP : 0
  const breakfastGross      = room1BreakfastGross + room2BreakfastGross
  // Breakfast Anz: person-nights (single room) or total persons (2 rooms)
  const totalBfstPersons    = adultCount + (hasRoom2 ? room2AdultCount : 0)
  const bfstAnz             = hasRoom2 ? totalBfstPersons : adultCount * nights
  const bfstEinzel          = hasRoom2 && totalBfstPersons > 0
    ? breakfastGross / totalBfstPersons
    : breakfastPPP

  // Accommodation = room price minus its breakfast share
  const accommodationGross      = totalPrice - room1BreakfastGross
  const room2AccommodationGross = hasRoom2 ? room2Gross - room2BreakfastGross : 0

  const grandTotal         = totalPrice + serviceTotal + customTotal
  const pricePerNight      = nights > 0 ? accommodationGross / nights : accommodationGross
  const room2PricePerNight = room2DisplayNights > 0 ? room2AccommodationGross / room2DisplayNights : room2AccommodationGross

  // Net amounts at applicable VAT rates
  const acc_net     = accommodationGross / (1 + BREAKFAST_VAT)
  const room2AccNet = hasRoom2 ? room2AccommodationGross / (1 + BREAKFAST_VAT) : 0
  const bfst_net    = breakfastGross > 0 ? breakfastGross / (1 + BREAKFAST_VAT) : 0
  const svc_net     = serviceTotal > 0   ? serviceTotal   / (1 + SERVICE_VAT)   : 0
  const sumNetto    = acc_net + room2AccNet + bfst_net + svc_net + custom7Net + custom19Net
  const vat7        = (accommodationGross - acc_net) + (room2AccommodationGross - room2AccNet) + (breakfastGross - bfst_net) + (custom7Gross - custom7Net)
  const vat19       = (serviceTotal - svc_net) + (custom19Gross - custom19Net)
  const sumBrutto   = grandTotal + room2Gross

  let posIdx = 0
  const POS = {
    accommodation: ++posIdx,
    room2:         hasRoom2         ? ++posIdx : null,
    breakfast:     hasBreakfast     ? ++posIdx : null,
    service:       serviceTotal > 0 ? ++posIdx : null,
    customStart:   posIdx + 1,
  }

  const addressLines = (inv.guest_address ?? '').split('\n').filter(Boolean) as string[]

  const guestLabel = childCount > 0
    ? `${adultCount} Erw. + ${childCount} Kind${childCount !== 1 ? 'er' : ''}`
    : `${adultCount} Erw.`

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          aside, nav, header { display: none !important; }
          .lg\\:ml-64,[class*="ml-64"] { margin-left: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          @page { margin: 0; size: A4 portrait; }
          body  { background: white !important; margin: 0 !important; padding: 0 !important; }
          .print-outer { background: white !important; padding: 0 !important; margin: 0 !important; }
          .page {
            width: 210mm !important;
            min-height: 0 !important;
            height: auto !important;
            padding: 9mm !important;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            page-break-after: avoid !important;
          }
        }
        body { background: #e2e8f0; }
      `}</style>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="no-print flex items-center gap-3 px-6 pt-5 pb-3 bg-white border-b border-slate-200 sticky top-0 z-10">
        <PrintButton />
        <a href="/invoices" className="text-sm text-slate-500 hover:text-slate-700">← Rechnungen</a>
        <span className="ml-auto text-xs text-slate-400">Rechnung {fmtNum(inv.invoice_number, new Date(inv.created_at).getFullYear())}</span>
      </div>

      {/* ── A4 document ─────────────────────────────────────────────────────── */}
      <div className="print-outer py-8 px-4">
        <div className="page bg-white shadow-2xl mx-auto flex flex-col"
             style={{ width: '794px', minHeight: '1123px', padding: '34px' }}>

          {/* ══ HEADER ════════════════════════════════════════════════════════ */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-shrink-0">
              <div className="bg-slate-800 rounded-xl px-4 py-3 inline-block">
                <Image src="/logo.png" alt="Jägerstieg Hotel & Pension"
                  width={150} height={72} className="object-contain" />
              </div>
            </div>

            <div className="text-right">
              <p className="text-5xl font-black text-slate-900 tracking-tight leading-none mb-1">RECHNUNG</p>
              <p className="text-sm text-slate-500 mt-1">
                Nr.&nbsp;<strong className="text-slate-800 font-mono tracking-wide">{fmtNum(inv.invoice_number, new Date(inv.created_at).getFullYear())}</strong>
              </p>
              <p className="text-sm text-slate-500 mt-0.5">
                Datum:&nbsp;<strong className="text-slate-700">{format(invoiceDate, 'dd.MM.yyyy')}</strong>
              </p>
              <div className="mt-2 text-xs leading-snug border-t border-slate-100 pt-2">
                <p className="font-bold text-slate-900 text-sm">Hotel-Pension Jägerstieg</p>
                <p className="text-slate-600">Verwaltung und Vertrieb G. Cetin Holding GmbH</p>
                <p className="text-slate-500">Von Eichendorf-Str. 16, 37539 Bad Grund</p>
                <p className="text-slate-500">Tel: +49 5327 2828 · info@jaegerstieg.de</p>
                <p className="text-slate-600 font-medium">CEO: A. Eddie Çetin</p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t-2 border-slate-800 mb-3" />

          {/* ══ GUEST ADDRESS ════════════════════════════════════════════════ */}
          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-1">
              Hotel-Pension Jägerstieg · Von Eichendorf-Str. 16 · 37539 Bad Grund
            </p>
            <p className="font-semibold text-slate-900">{inv.guest_name}</p>
            {inv.guest_email && <p className="text-sm text-slate-500">{inv.guest_email}</p>}
            {addressLines.map((line: string, i: number) => (
              <p key={i} className="text-sm text-slate-600">{line}</p>
            ))}
          </div>

          {/* Early departure warning */}
          {inv.early_departure && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 px-4 py-3 mb-5 flex items-center gap-3">
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
          <table className="w-full text-sm mb-4 border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white text-xs uppercase tracking-wide">
                <th className="px-3 py-2 text-left font-semibold rounded-tl-lg w-8">Pos.</th>
                <th className="px-3 py-2 text-left font-semibold">Beschreibung</th>
                <th className="px-3 py-2 text-center font-semibold w-12">Anz.</th>
                <th className="px-3 py-2 text-right font-semibold w-28">Einzelpreis</th>
                <th className="px-3 py-2 text-center font-semibold w-14">MwSt.</th>
                <th className="px-3 py-2 text-right font-semibold w-28">Gesamt Netto</th>
                <th className="px-3 py-2 text-right font-semibold rounded-tr-lg w-28">Gesamt Brutto</th>
              </tr>
            </thead>
            <tbody>

              {/* Pos 1: Room type as main description */}
              <tr className="border-b border-slate-100">
                <td className="px-3 py-2 text-slate-400 text-xs align-top">{POS.accommodation}</td>
                <td className="px-3 py-2 text-slate-800 align-top">
                  <span className="font-medium">{inv.room_name || 'Übernachtung'}</span>
                  <span className="block text-xs text-slate-400 mt-0.5">
                    Zimmer Nr. {inv.room_number} · {format(checkin, 'dd.MM.yyyy')} {format(checkin, 'HH:mm')} Uhr – {format(checkout, 'dd.MM.yyyy')} {format(checkout, 'HH:mm')} Uhr · {guestLabel}
                  </span>
                  {inv.early_departure && (
                    <span className="inline-block mt-1 text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
                      Vorzeitige Abreise
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-center text-slate-600 align-top">{nights}</td>
                <td className="px-3 py-2 text-right text-slate-600 align-top">{eur(pricePerNight)}</td>
                <td className="px-3 py-2 text-center text-slate-500 text-xs align-top">7 %</td>
                <td className="px-3 py-2 text-right text-slate-600 align-top">{eur(acc_net)}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-800 align-top">{eur(accommodationGross)}</td>
              </tr>

              {/* Pos 2: Second room (if booked) */}
              {hasRoom2 && (
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-400 text-xs align-top">{POS.room2}</td>
                  <td className="px-3 py-2 text-slate-800 align-top">
                    <span className="font-medium">{inv.room2_name || 'Zweites Zimmer'}</span>
                    <span className="block text-xs text-slate-400 mt-0.5">
                      Zimmer Nr. {inv.room2_number} · {format(room2CheckinDate, 'dd.MM.yyyy')} {format(room2CheckinDate, 'HH:mm')} Uhr – {format(room2CheckoutDate, 'dd.MM.yyyy')} {format(room2CheckoutDate, 'HH:mm')} Uhr · {room2GuestLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-slate-600 align-top">{room2DisplayNights}</td>
                  <td className="px-3 py-2 text-right text-slate-600 align-top">{eur(room2PricePerNight)}</td>
                  <td className="px-3 py-2 text-center text-slate-500 text-xs align-top">7 %</td>
                  <td className="px-3 py-2 text-right text-slate-600 align-top">{eur(room2AccNet)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800 align-top">{eur(room2AccommodationGross)}</td>
                </tr>
              )}

              {/* Frühstück */}
              {hasBreakfast && (
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-400 text-xs align-top">{POS.breakfast}</td>
                  <td className="px-3 py-2 text-slate-800 align-top">
                    <span className="font-medium">Frühstück</span>
                    <span className="block text-xs text-slate-400 mt-0.5">
                      {hasRoom2
                        ? `${totalBfstPersons} Pers. (Zi. ${inv.room_number} + Zi. ${inv.room2_number})`
                        : `${adultCount} Pers. × ${nights} Nacht${nights !== 1 ? 'e' : ''}`
                      }
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-slate-600 align-top">{bfstAnz}</td>
                  <td className="px-3 py-2 text-right text-slate-600 align-top">{eur(bfstEinzel)}</td>
                  <td className="px-3 py-2 text-center text-slate-500 text-xs align-top">7 %</td>
                  <td className="px-3 py-2 text-right text-slate-600 align-top">{eur(bfst_net)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800 align-top">{eur(breakfastGross)}</td>
                </tr>
              )}

              {/* Zimmerservice */}
              {serviceTotal > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-400 text-xs align-top">{POS.service}</td>
                  <td className="px-3 py-2 text-slate-800 align-top">
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
                  <td className="px-3 py-2 text-center text-slate-400 text-xs align-top">—</td>
                  <td className="px-3 py-2 text-right text-slate-400 text-xs align-top">—</td>
                  <td className="px-3 py-2 text-center text-slate-500 text-xs align-top">19 %</td>
                  <td className="px-3 py-2 text-right text-slate-600 align-top">{eur(svc_net)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800 align-top">{eur(serviceTotal)}</td>
                </tr>
              )}

              {/* Custom line items */}
              {customItems.map((item, idx) => {
                const gross = item.qty * item.unit_price
                const net   = gross / (1 + item.vat_rate / 100)
                return (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-400 text-xs align-top">{POS.customStart + idx}</td>
                    <td className="px-3 py-2 text-slate-800 align-top">
                      <span className="font-medium">{item.description || 'Sonstiges'}</span>
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600 align-top">{item.qty}</td>
                    <td className="px-3 py-2 text-right text-slate-600 align-top">{eur(item.unit_price)}</td>
                    <td className="px-3 py-2 text-center text-slate-500 text-xs align-top">{item.vat_rate} %</td>
                    <td className="px-3 py-2 text-right text-slate-600 align-top">{eur(net)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800 align-top">{eur(gross)}</td>
                  </tr>
                )
              })}

            </tbody>
          </table>

          {/* ══ TOTALS ════════════════════════════════════════════════════════ */}
          <div className="flex items-start justify-between mb-4 gap-6">
            <div className="text-xs text-slate-400 flex-1 pt-1">
              {inv.notes && <p className="text-slate-600 text-sm">{inv.notes}</p>}
            </div>

            <div className="flex-shrink-0" style={{ width: '270px' }}>
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
                  {(serviceTotal > 0 || custom19Gross > 0) && (
                    <tr className="border-b border-slate-100">
                      <td className="py-2 text-slate-500">MwSt. 19 %</td>
                      <td className="py-2 text-right font-medium text-slate-700">{eur(vat19)}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={2} className="pt-2">
                      <div className="flex justify-between items-center bg-slate-800 text-white px-4 py-3 rounded-lg">
                        <span className="font-bold text-sm">Summe Brutto</span>
                        <span className="font-black text-xl">{eur(sumBrutto)}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
              {/* Zahlungsart: Bar erhalten style */}
              <div className="mt-2.5 px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-center">
                <span className="font-semibold text-slate-800">
                  Zahlungsart: {PAY_LABELS[inv.payment_method] ?? inv.payment_method}
                </span>
              </div>
            </div>
          </div>

          {/* ══ SPACER ════════════════════════════════════════════════════════ */}
          <div className="flex-1" />

          {/* ══ FOOTER ════════════════════════════════════════════════════════ */}
          <div className="border-t border-slate-200 pt-3 mt-1">

            {/* Signature row */}
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-lg text-slate-700" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                  A. Eddie Çetin
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Geschäftsführer</p>
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>Rechnung Nr. {fmtNum(inv.invoice_number, new Date(inv.created_at).getFullYear())}</p>
                <p className="mt-0.5">Datum: {format(invoiceDate, 'd. MMMM yyyy', { locale: de })}</p>
                <p className="mt-0.5">Jägerstieg Hotel &amp; Pension · info@jaegerstieg.de</p>
              </div>
            </div>

            {/* Bank details + legal — compact single-border block */}
            <div className="border-t border-slate-100 pt-2 grid grid-cols-2 gap-x-8 text-xs text-slate-500">
              <div className="space-y-0">
                <p className="font-semibold text-slate-700">Bankverbindung: HASPA HAMBURG</p>
                <p>Konto Inhaber: Aaron Eddie Cetin</p>
                <p>IBAN: DE33 2005 0550 1501 0613 43</p>
                <p>BIC: HASPDEHHXXX</p>
              </div>
              <div className="space-y-0">
                <p className="font-semibold text-slate-700">Rechtliche Angaben</p>
                <p>Amtsgericht Oldenburg HRB 200157</p>
                <p>St.Nr.: 35 / 202 / 02346</p>
              </div>
            </div>

            <p className="text-center text-xs text-slate-300 mt-2 border-t border-slate-100 pt-2">
              Vielen Dank für Ihren Aufenthalt! · Alle Preise inkl. MwSt.
            </p>
          </div>

        </div>
      </div>
    </>
  )
}
