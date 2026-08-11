/**
 * Everything an invoice works out from its stored row.
 *
 * Extracted so the vector PDF renders from exactly the same arithmetic as the
 * on-screen document instead of a second, drifting copy. The expressions are
 * carried over verbatim from InvoiceDocument — this file must stay a pure
 * function of the row plus its payments: no database, no formatting decisions
 * beyond the few labels the layout reads back.
 */

import { summarizeLedger, type PaymentRow } from './deposit'

/** Reduced rate on the overnight stay. */
export const LODGING_VAT = 0.07
/** Breakfast and room service are taxed at the standard rate. */
export const STANDARD_VAT = 0.19

export interface ServiceItem { name: string; qty: number }
export interface CustomLineItem {
  id: string; name: string; description: string
  qty: number; unit_price: number; vat_rate: 7 | 19
}
export interface GroupRoomLine {
  room_number: string; room_name: string
  checkin_at: string; checkout_at: string
  nights: number; adults: number; children: number; price: number
}

/** One row of the item table, already priced and labelled. */
export interface InvoiceItem {
  pos:      number
  title:    string
  /** Second line under the title, when there is one. */
  subtitle: string | null
  /** "Frühstück | Ohne Getränke" renders its second half greyed. */
  titleSuffix?: string
  /** Bullets under the title — room service lists what was ordered. */
  bullets?: string[]
  qty:      string
  unit:     string
  vat:      string
  net:      number
  gross:    number
}

export interface InvoiceMath {
  isFreeform:  boolean
  isCancelled: boolean
  cancelledAt: string | null

  items:      InvoiceItem[]
  addressLines: string[]

  sumNetto:   number
  vat7:       number
  vat19:      number
  vatTotal:   number
  sumBrutto:  number
  discount:   number
  hasDiscount: boolean
  grossTotal: number
  amountDue:  number

  ledger:      ReturnType<typeof summarizeLedger>
  hasPayments: boolean
  /** No payment received and the invoice is unpaid → "Zahlung ausstehend". */
  settled:     boolean
  partly:      boolean
  paymentMethod: string
}

const nn = (n: number) => `${n} ${n === 1 ? 'Nacht' : 'Nächte'}`

/* eslint-disable @typescript-eslint/no-explicit-any */
export function invoiceMath(inv: any, payments: PaymentRow[]): InvoiceMath {
  const isFreeform  = !inv.room_number
  const isCancelled = !!inv.cancelled_at

  const adultCount   = (inv.guest_count ?? 1) as number
  const childCount   = (inv.child_count ?? 0) as number
  const nights       = (inv.nights ?? 1) as number
  const breakfastPPP = (inv.breakfast_price_per_person ?? 10) as number
  const hasBreakfast = !!inv.breakfast_included
  const serviceItems: ServiceItem[] = Array.isArray(inv.room_service_items) ? inv.room_service_items : []
  const serviceTotal = (inv.room_service_total ?? 0) as number
  const totalPrice   = (inv.total_price ?? 0) as number
  const customItems: CustomLineItem[] = Array.isArray(inv.line_items) ? inv.line_items : []

  const groupRooms: GroupRoomLine[] = Array.isArray(inv.group_rooms) ? inv.group_rooms : []
  const isGroup          = groupRooms.length > 0
  const groupGross       = groupRooms.reduce((s, g) => s + (g.price ?? 0), 0)
  const groupAdultNights = groupRooms.reduce((s, g) => s + g.adults * g.nights, 0)

  const custom7Gross  = customItems.filter(i => i.vat_rate === 7) .reduce((s, i) => s + i.qty * i.unit_price, 0)
  const custom19Gross = customItems.filter(i => i.vat_rate === 19).reduce((s, i) => s + i.qty * i.unit_price, 0)
  const custom7Net    = custom7Gross  > 0 ? custom7Gross  / 1.07 : 0
  const custom19Net   = custom19Gross > 0 ? custom19Gross / 1.19 : 0
  const customTotal   = custom7Gross + custom19Gross

  const room2Gross = (inv.room2_total_price ?? 0) as number
  const hasRoom2   = room2Gross > 0 && !!inv.room2_number
  const room2NightsCalc = inv.room2_checkin_at && inv.room2_checkout_at
    ? Math.max(1, Math.round(
        (new Date(inv.room2_checkout_at).getTime() - new Date(inv.room2_checkin_at).getTime()) / 86400000))
    : nights
  const room2DisplayNights = ((inv.room2_nights ?? room2NightsCalc) || 1) as number
  const room2AdultCount    = (inv.room2_guest_count ?? adultCount) as number
  const room2ChildCountNum = (inv.room2_child_count ?? 0) as number

  // Breakfast comes out of each room's gross price separately.
  const room1BreakfastGross = hasBreakfast
    ? (isGroup ? groupAdultNights * breakfastPPP : adultCount * nights * breakfastPPP)
    : 0
  const room2BreakfastGross = hasRoom2 && hasBreakfast ? room2AdultCount * room2DisplayNights * breakfastPPP : 0
  const breakfastGross      = room1BreakfastGross + room2BreakfastGross
  const bfstAnz = isGroup
    ? groupAdultNights
    : adultCount * nights + (hasRoom2 ? room2AdultCount * room2DisplayNights : 0)

  // Rooms of a group can have their own dates, so state the quantity per stay
  // length rather than as one figure that would not match the Anz. column.
  const bfstDescription = (() => {
    if (isGroup) {
      const byNights = new Map<number, number>()
      for (const g of groupRooms) byNights.set(g.nights, (byNights.get(g.nights) ?? 0) + g.adults)
      return [...byNights.entries()].sort((a, b) => a[0] - b[0])
        .map(([n, persons]) => `${persons} Pers. × ${nn(n)}`).join(' · ')
    }
    if (hasRoom2) {
      return `Zi. ${inv.room_number}: ${adultCount} Pers. × ${nn(nights)}`
           + ` · Zi. ${inv.room2_number}: ${room2AdultCount} Pers. × ${nn(room2DisplayNights)}`
    }
    return `${adultCount} Pers. × ${nn(nights)}`
  })()

  const accommodationGross      = (isGroup ? groupGross : totalPrice) - room1BreakfastGross
  const room2AccommodationGross = hasRoom2 ? room2Gross - room2BreakfastGross : 0

  const grandTotal = (isGroup ? groupGross : totalPrice) + serviceTotal + customTotal

  const bfstVatPct = Number(inv.breakfast_vat_rate ?? 7)
  const bfstVat    = bfstVatPct / 100

  const acc_net     = accommodationGross / (1 + LODGING_VAT)
  const room2AccNet = hasRoom2 ? room2AccommodationGross / (1 + LODGING_VAT) : 0
  const bfst_net    = breakfastGross > 0 ? breakfastGross / (1 + bfstVat) : 0
  const svc_net     = serviceTotal > 0 ? serviceTotal / (1 + STANDARD_VAT) : 0
  const bfstVatAmt  = breakfastGross - bfst_net

  const sumNetto = acc_net + room2AccNet + bfst_net + svc_net + custom7Net + custom19Net
  const vat7  = (accommodationGross - acc_net) + (room2AccommodationGross - room2AccNet)
              + (custom7Gross - custom7Net) + (bfstVatPct === 7 ? bfstVatAmt : 0)
  const vat19 = (serviceTotal - svc_net) + (custom19Gross - custom19Net)
              + (bfstVatPct === 19 ? bfstVatAmt : 0)
  const sumBrutto   = grandTotal + room2Gross
  const discount    = (inv.discount ?? 0) as number
  const hasDiscount = discount > 0
  const grossTotal  = hasDiscount ? sumBrutto - discount : sumBrutto

  const ledger      = summarizeLedger(payments, grossTotal)
  const hasPayments = ledger.payments.length > 0

  // ── Item rows, numbered the way the document numbers them ────────────────
  const items: InvoiceItem[] = []
  let pos = 0

  if (isGroup) {
    for (const g of groupRooms) {
      // The stored room price includes breakfast, billed on its own line.
      const gBreakfast = hasBreakfast ? g.adults * g.nights * breakfastPPP : 0
      const gGross     = g.price - gBreakfast
      items.push({
        pos: ++pos,
        title: g.room_name || 'Übernachtung',
        subtitle: `Zimmer Nr. ${g.room_number} · ${deDate(g.checkin_at)} – ${deDate(g.checkout_at)}`
          + ` · ${g.adults} Erw.${g.children > 0 ? ` + ${g.children} Kind${g.children !== 1 ? 'er' : ''}` : ''}`,
        qty:   String(g.nights),
        unit:  g.nights > 0 ? fmt(gGross / g.nights) : fmt(gGross),
        vat:   '7 %',
        net:   gGross / (1 + LODGING_VAT),
        gross: gGross,
      })
    }
  } else if (!isFreeform) {
    items.push({
      pos: ++pos,
      title: inv.room_name || 'Übernachtung',
      subtitle: `Zimmer Nr. ${inv.room_number} · ${deDateTime(inv.checkin_at)} Uhr – ${deDateTime(inv.checkout_at)} Uhr`
        + ` · ${guestLabel(adultCount, childCount)}`,
      qty:   String(nights),
      unit:  fmt(nights > 0 ? accommodationGross / nights : accommodationGross),
      vat:   '7 %',
      net:   acc_net,
      gross: accommodationGross,
    })
  }

  if (hasRoom2) {
    items.push({
      pos: ++pos,
      title: inv.room2_name || 'Zweites Zimmer',
      subtitle: `Zimmer Nr. ${inv.room2_number} · ${deDateTime(inv.room2_checkin_at ?? inv.checkin_at)} Uhr`
        + ` – ${deDateTime(inv.room2_checkout_at ?? inv.checkout_at)} Uhr`
        + ` · ${guestLabel(room2AdultCount, room2ChildCountNum)}`,
      qty:   String(room2DisplayNights),
      unit:  fmt(room2DisplayNights > 0 ? room2AccommodationGross / room2DisplayNights : room2AccommodationGross),
      vat:   '7 %',
      net:   room2AccNet,
      gross: room2AccommodationGross,
    })
  }

  if (hasBreakfast) {
    items.push({
      pos: ++pos,
      title: 'Frühstück',
      titleSuffix: ' | Ohne Getränke',
      subtitle: bfstDescription,
      qty:   String(bfstAnz),
      unit:  fmt(breakfastPPP),
      vat:   `${bfstVatPct} %`,
      net:   bfst_net,
      gross: breakfastGross,
    })
  }

  if (serviceTotal > 0) {
    items.push({
      pos: ++pos,
      title: 'Zimmerservice',
      subtitle: null,
      bullets: serviceItems.map(i => `${i.name}${i.qty > 1 ? ` × ${i.qty}` : ''}`),
      qty:   '—',
      unit:  '—',
      vat:   '19 %',
      net:   svc_net,
      gross: serviceTotal,
    })
  }

  for (const item of customItems) {
    const gross = item.qty * item.unit_price
    items.push({
      pos: ++pos,
      title: item.name || item.description || 'Sonstiges',
      subtitle: item.name && item.description ? item.description : null,
      qty:   String(item.qty),
      unit:  fmt(item.unit_price),
      vat:   `${item.vat_rate} %`,
      net:   gross / (1 + item.vat_rate / 100),
      gross,
    })
  }

  return {
    isFreeform, isCancelled,
    cancelledAt: inv.cancelled_at ?? null,
    items,
    addressLines: (inv.guest_address ?? '').split('\n').filter(Boolean),
    sumNetto, vat7, vat19, vatTotal: vat7 + vat19,
    sumBrutto, discount, hasDiscount, grossTotal,
    amountDue: hasPayments ? ledger.remaining : grossTotal,
    ledger, hasPayments,
    settled: ledger.settled,
    partly:  ledger.partly,
    paymentMethod: inv.payment_method,
  }
}

// ── Small formatters the item labels need ───────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function guestLabel(adults: number, children: number): string {
  return children > 0
    ? `${adults} Erw. + ${children} Kind${children !== 1 ? 'er' : ''}`
    : `${adults} Erw.`
}

/** Pinned to the hotel's zone, like every other date on the invoice. */
function deDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d)
}

function deDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const time = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  return `${deDate(iso)} ${time}`
}
