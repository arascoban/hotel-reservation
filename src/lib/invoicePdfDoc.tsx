/**
 * The invoice as a real PDF — vector text, not a photograph of the screen.
 *
 * The existing path rasterises the rendered HTML with html2canvas, so the
 * text is pixels: soft at any zoom and heavy on disk. This renders the same
 * document with @react-pdf/renderer, which embeds fonts and draws text as
 * text. The result is crisp at any zoom, selectable, searchable and about a
 * tenth of the size.
 *
 * All arithmetic comes from invoiceMath(), the same module the on-screen
 * document is meant to read, so the two can never disagree about a number —
 * only about looks.
 *
 * Layout notes:
 * - Sizes are the HTML layout's pixels × 0.75, because the sheet is 794px
 *   wide (A4 at 96dpi) and A4 is 595.28pt. So the proportions carry over.
 * - The footer is `fixed`, which in react-pdf means "repeat on every page",
 *   and the page reserves room for it with paddingBottom.
 * - Pagination is automatic: rows flow onto the next page when they no
 *   longer fit, so every page is filled rather than cut at a fixed count.
 */

import React from 'react'
import fs from 'fs'
import path from 'path'
import {
  Document, Page, Text, View, Image, StyleSheet, Font,
} from '@react-pdf/renderer'
import type { InvoiceMath } from './invoiceMath'
import { formatDeDate, PAYMENT_KIND_LABELS, DEPOSIT_METHOD_LABELS, REMAINING_DUE_TEXT } from './deposit'

/** HTML pixels → PDF points. */
const px = (n: number) => n * 0.75

/**
 * Locate a bundled asset, trying the paths a Next.js server may run from —
 * the same approach the mail logo uses, because `public/` is only inside a
 * serverless bundle when next.config lists it.
 */
function assetPath(...parts: string[]): string | null {
  const roots = [
    process.cwd(),
    path.join(process.cwd(), '.next', 'standalone'),
    path.join(process.cwd(), '..'),
  ]
  for (const root of roots) {
    const p = path.join(root, 'public', ...parts)
    try { if (fs.existsSync(p)) return p } catch { /* try the next root */ }
  }
  return null
}

let fontsReady = false

/** Register the embedded fonts once per process. */
export function registerInvoiceFonts(): void {
  if (fontsReady) return
  const regular = assetPath('fonts', 'LiberationSans-Regular.ttf')
  const bold    = assetPath('fonts', 'LiberationSans-Bold.ttf')
  const italic  = assetPath('fonts', 'LiberationSerif-Italic.ttf')
  if (!regular || !bold || !italic) {
    // Without the files react-pdf falls back to Helvetica, which cannot render
    // Turkish ğ ş ı — better to know than to ship broken names.
    throw new Error('Schriftdateien für die PDF-Erzeugung nicht gefunden.')
  }
  Font.register({
    family: 'Liberation',
    fonts: [
      { src: regular, fontWeight: 'normal' },
      { src: bold,    fontWeight: 'bold' },
    ],
  })
  Font.register({ family: 'LiberationSerif', fonts: [{ src: italic, fontStyle: 'italic' }] })
  // Long words (an e-mail address, an IBAN) must not be hyphenated apart.
  Font.registerHyphenationCallback(w => [w])
  fontsReady = true
}

/** The logo as a data URI, or null when the file is not in the bundle. */
export function loadLogoDataUri(): string | null {
  const p = assetPath('logo.png')
  if (!p) return null
  try {
    return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`
  } catch {
    return null
  }
}

const C = {
  ink:    '#0f172a',
  body:   '#334155',
  muted:  '#64748b',
  faint:  '#94a3b8',
  hair:   '#e2e8f0',
  hairer: '#f1f5f9',
  dark:   '#1e293b',
  blue:   '#2563eb',
  red:    '#dc2626',
  green:  '#15803d',
  amber:  '#b45309',
}

const s = StyleSheet.create({
  page: {
    fontFamily: 'Liberation',
    fontSize:   px(13),
    color:      C.body,
    paddingTop:    px(28),
    paddingBottom: px(178),   // room for the repeating footer
    paddingHorizontal: px(28),
  },
  // ── header ──
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: px(12) },
  logoBox:    { backgroundColor: C.dark, borderRadius: px(12), padding: px(12) },
  logo:       { width: px(150), height: px(72), objectFit: 'contain' },
  title:      { fontSize: px(48), fontWeight: 'bold', color: C.ink, letterSpacing: -1 },
  headRight:  { alignItems: 'flex-end' },
  meta:       { fontSize: px(14), color: C.muted, marginTop: px(4) },
  hotelBlock: { marginTop: px(8), paddingTop: px(8), borderTopWidth: 1, borderTopColor: C.hairer, alignItems: 'flex-end' },
  rule:       { borderBottomWidth: px(2), borderBottomColor: C.dark, marginBottom: px(12) },

  // ── recipient ──
  fromLine: { fontSize: px(12), color: C.faint, marginBottom: px(4) },
  toName:   { fontWeight: 'bold', color: C.ink, fontSize: px(14) },
  toLine:   { fontSize: px(13), color: C.body },

  // ── table ──
  thead:  { flexDirection: 'row', backgroundColor: C.dark, borderRadius: px(6), paddingVertical: px(7), paddingHorizontal: px(2) },
  th:     { color: '#ffffff', fontSize: px(10), fontWeight: 'bold', textTransform: 'uppercase', paddingHorizontal: px(10) },
  tr:     { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.hairer, paddingVertical: px(7), paddingHorizontal: px(2) },
  td:     { fontSize: px(13), color: C.body, paddingHorizontal: px(10) },
  cPos:   { width: '6%' },
  cDesc:  { width: '40%' },
  cQty:   { width: '8%',  textAlign: 'center' },
  cUnit:  { width: '14%', textAlign: 'right' },
  cVat:   { width: '10%', textAlign: 'center' },
  cNet:   { width: '11%', textAlign: 'right' },
  cGross: { width: '11%', textAlign: 'right' },
  sub:    { fontSize: px(11), color: C.faint, marginTop: px(2) },

  // ── totals ──
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: px(12) },
  totals:     { width: px(270) },
  totalRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: px(6),
                borderBottomWidth: 1, borderBottomColor: C.hairer },
  sumBox:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                backgroundColor: C.dark, borderRadius: px(8), paddingHorizontal: px(16), paddingVertical: px(10), marginTop: px(8) },
  noteBox:    { marginTop: px(10), borderRadius: px(8), paddingHorizontal: px(16), paddingVertical: px(12), borderWidth: 1 },

  // ── footer ──
  footer: {
    position: 'absolute', left: px(28), right: px(28), bottom: px(28),
    borderTopWidth: 1, borderTopColor: C.hair, paddingTop: px(12),
  },
  legalGrid: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.hairer, paddingTop: px(8), marginTop: px(12) },
})

function eur(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export interface InvoicePdfProps {
  m:            InvoiceMath
  invoiceRef:   string
  invoiceDate:  string   // "11.08.2026"
  invoiceDateLong: string
  guestName:    string
  guestEmail:   string | null
  logo:         string | null   // data URI
}

export function InvoicePdf({ m, invoiceRef, invoiceDate, invoiceDateLong, guestName, guestEmail, logo }: InvoicePdfProps) {
  return (
    <Document title={`Rechnung ${invoiceRef}`} author="Hotel-Pension Jägerstieg">
      <Page size="A4" style={s.page}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={s.headerRow}>
          <View style={s.logoBox}>
            {logo ? <Image style={s.logo} src={logo} /> : <Text style={{ color: '#fff' }}>Jägerstieg</Text>}
          </View>
          <View style={s.headRight}>
            <Text style={s.title}>RECHNUNG</Text>
            {m.isCancelled && (
              <Text style={{ backgroundColor: C.red, color: '#fff', fontSize: px(13), fontWeight: 'bold',
                             paddingHorizontal: px(10), paddingVertical: px(3), borderRadius: px(4), marginTop: px(4) }}>
                STORNIERT
              </Text>
            )}
            <Text style={s.meta}>Nr. <Text style={{ color: C.ink, fontWeight: 'bold' }}>{invoiceRef}</Text></Text>
            <Text style={s.meta}>Datum: <Text style={{ color: C.body, fontWeight: 'bold' }}>{invoiceDate}</Text></Text>
            <View style={s.hotelBlock}>
              <Text style={{ fontSize: px(13), fontWeight: 'bold', color: C.ink }}>Hotel-Pension Jägerstieg</Text>
              <Text style={{ fontSize: px(11), color: C.body }}>Verwaltung und Vertrieb G. Cetin Holding GmbH</Text>
              <Text style={{ fontSize: px(11), color: C.muted }}>Von Eichendorf-Str. 16, 37539 Bad Grund</Text>
              <Text style={{ fontSize: px(11), color: C.muted }}>Tel: +49 5327 2828 · info@jaegerstieg.de</Text>
              <Text style={{ fontSize: px(11), color: C.body, fontWeight: 'bold' }}>CEO: A. Eddie Çetin</Text>
            </View>
          </View>
        </View>
        <View style={s.rule} />

        {/* ── Cancelled banner ───────────────────────────────────── */}
        {m.isCancelled && (
          <View style={{ borderWidth: px(2), borderColor: '#ef4444', backgroundColor: '#fef2f2',
                         borderRadius: px(12), padding: px(12), marginBottom: px(16) }}>
            <Text style={{ fontSize: px(16), fontWeight: 'bold', color: '#b91c1c' }}>
              STORNIERT · Diese Rechnung ist ungültig
            </Text>
            {m.cancelledAt && (
              <Text style={{ fontSize: px(11), color: C.red, marginTop: px(2) }}>
                Storniert am {formatDeDate(m.cancelledAt)}. Es besteht keine Zahlungsverpflichtung.
              </Text>
            )}
          </View>
        )}

        {/* ── Recipient ──────────────────────────────────────────── */}
        <View style={{ marginBottom: px(16) }}>
          <Text style={s.fromLine}>Hotel-Pension Jägerstieg · Von Eichendorf-Str. 16 · 37539 Bad Grund</Text>
          <Text style={s.toName}>{guestName}</Text>
          {guestEmail ? <Text style={{ ...s.toLine, color: C.muted }}>{guestEmail}</Text> : null}
          {m.addressLines.map((line, i) => <Text key={i} style={s.toLine}>{line}</Text>)}
        </View>

        {/* ── Items ──────────────────────────────────────────────── */}
        {/* The header repeats whenever the rows spill onto a new page. */}
        <View style={s.thead} fixed>
          <Text style={[s.th, s.cPos]}>Pos.</Text>
          <Text style={[s.th, s.cDesc]}>Beschreibung</Text>
          <Text style={[s.th, s.cQty]}>Anz.</Text>
          <Text style={[s.th, s.cUnit]}>Einzelpreis</Text>
          <Text style={[s.th, s.cVat]}>MwSt.</Text>
          <Text style={[s.th, s.cNet]}>Netto</Text>
          <Text style={[s.th, s.cGross]}>Brutto</Text>
        </View>

        {m.items.map(item => (
          <View key={item.pos} style={s.tr} wrap={false}>
            <Text style={[s.td, s.cPos, { color: C.faint, fontSize: px(11) }]}>{item.pos}</Text>
            <View style={s.cDesc}>
              <Text style={{ paddingHorizontal: px(10), fontSize: px(13), color: C.ink }}>
                <Text style={{ fontWeight: 'bold' }}>{item.title}</Text>
                {item.titleSuffix ? <Text style={{ color: C.muted }}>{item.titleSuffix}</Text> : null}
              </Text>
              {item.subtitle ? (
                <Text style={[s.sub, { paddingHorizontal: px(10) }]}>{item.subtitle}</Text>
              ) : null}
              {item.bullets?.map((b, i) => (
                <Text key={i} style={[s.sub, { paddingHorizontal: px(10) }]}>{b}</Text>
              ))}
            </View>
            <Text style={[s.td, s.cQty]}>{item.qty}</Text>
            <Text style={[s.td, s.cUnit]}>{item.unit}</Text>
            <Text style={[s.td, s.cVat, { color: C.muted, fontSize: px(11) }]}>{item.vat}</Text>
            <Text style={[s.td, s.cNet]}>{eur(item.net)}</Text>
            <Text style={[s.td, s.cGross, { fontWeight: 'bold', color: C.ink }]}>{eur(item.gross)}</Text>
          </View>
        ))}

        {/* ── Totals ─────────────────────────────────────────────── */}
        <View style={s.totalsWrap} wrap={false}>
          <View style={s.totals}>
            <View style={s.totalRow}>
              <Text style={{ color: C.muted }}>Summe Netto</Text>
              <Text style={{ fontWeight: 'bold', color: C.body }}>{eur(m.sumNetto)}</Text>
            </View>
            {m.vat7 > 0 && (
              <View style={s.totalRow}>
                <Text style={{ color: C.muted }}>MwSt. 7 %</Text>
                <Text style={{ fontWeight: 'bold', color: C.body }}>{eur(m.vat7)}</Text>
              </View>
            )}
            {m.vat19 > 0 && (
              <View style={s.totalRow}>
                <Text style={{ color: C.muted }}>MwSt. 19 %</Text>
                <Text style={{ fontWeight: 'bold', color: C.body }}>{eur(m.vat19)}</Text>
              </View>
            )}
            {m.vatTotal > 0 && (
              <View style={[s.totalRow, { borderBottomColor: C.hair }]}>
                <Text style={{ color: C.body, fontWeight: 'bold' }}>MwSt. gesamt</Text>
                <Text style={{ fontWeight: 'bold', color: C.ink }}>{eur(m.vatTotal)}</Text>
              </View>
            )}
            {m.hasDiscount && (
              <>
                <View style={s.totalRow}>
                  <Text style={{ color: C.muted }}>Summe Brutto</Text>
                  <Text style={{ fontWeight: 'bold', color: C.body }}>{eur(m.sumBrutto)}</Text>
                </View>
                <View style={s.totalRow}>
                  <Text style={{ color: C.red, fontWeight: 'bold' }}>Rabatt</Text>
                  <Text style={{ color: C.red, fontWeight: 'bold' }}>− {eur(m.discount)}</Text>
                </View>
              </>
            )}

            {m.hasPayments && (
              <>
                {!m.hasDiscount && (
                  <View style={s.totalRow}>
                    <Text style={{ color: C.muted }}>Summe Brutto</Text>
                    <Text style={{ fontWeight: 'bold', color: C.body }}>{eur(m.grossTotal)}</Text>
                  </View>
                )}
                {m.ledger.payments.map(p => (
                  <View key={p.id} style={s.totalRow}>
                    <Text style={{ color: C.muted, fontSize: px(12) }}>
                      {formatDeDate(p.paid_on)} · {PAYMENT_KIND_LABELS[p.kind]} · {DEPOSIT_METHOD_LABELS[p.method] ?? p.method}
                    </Text>
                    <Text style={{ fontWeight: 'bold', color: p.kind === 'refund' ? C.red : C.green }}>
                      {p.kind === 'refund' ? '+' : '−'} {eur(Number(p.amount))}
                    </Text>
                  </View>
                ))}
              </>
            )}

            <View style={s.sumBox}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: px(14) }}>
                {m.hasPayments ? 'Restbetrag' : m.hasDiscount ? 'Neue Summe' : 'Summe Brutto'}
              </Text>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: px(20) }}>{eur(m.amountDue)}</Text>
            </View>

            {m.isCancelled ? (
              <View style={[s.noteBox, { borderColor: '#ef4444', backgroundColor: '#fef2f2', borderWidth: px(2) }]}>
                <Text style={{ textAlign: 'center', fontWeight: 'bold', color: '#b91c1c', letterSpacing: 2 }}>STORNIERT</Text>
              </View>
            ) : m.settled ? (
              <View style={[s.noteBox, { borderColor: '#86efac', backgroundColor: '#f0fdf4' }]}>
                <Text style={{ textAlign: 'center', fontWeight: 'bold', color: '#166534' }}>Vollständig bezahlt</Text>
                <Text style={{ textAlign: 'center', fontSize: px(11), color: C.green, marginTop: px(2) }}>
                  Der Gesamtbetrag ist vollständig ausgeglichen.
                </Text>
              </View>
            ) : (m.paymentMethod === 'unpaid' || m.partly) ? (
              <View style={[s.noteBox, { borderColor: '#fcd34d', backgroundColor: '#fffbeb' }]}>
                <Text style={{ textAlign: 'center', fontWeight: 'bold', color: '#92400e' }}>
                  {m.partly ? 'Restbetrag ausstehend' : 'Zahlung ausstehend'}
                </Text>
                {/* Only meaningful once part of the invoice has been paid. */}
                {m.partly && (
                  <>
                    <Text style={{ textAlign: 'center', color: C.amber, marginTop: px(2) }}>
                      Offener Betrag: {eur(m.amountDue)}
                    </Text>
                    <Text style={{ textAlign: 'center', fontSize: px(10), color: C.amber, marginTop: px(4) }}>
                      {REMAINING_DUE_TEXT}
                    </Text>
                  </>
                )}
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Footer, repeated on every page ─────────────────────── */}
        <View style={s.footer} fixed>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <Text style={{ fontFamily: 'LiberationSerif', fontStyle: 'italic', fontSize: px(18), color: C.body }}>
                A. Eddie Çetin
              </Text>
              <Text style={{ fontSize: px(11), color: C.muted, marginTop: px(2) }}>Geschäftsführer</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text
                style={{ fontSize: px(11), color: C.faint }}
                render={({ pageNumber, totalPages }) =>
                  `Rechnung Nr. ${invoiceRef}${totalPages > 1 ? ` · Seite ${pageNumber} von ${totalPages}` : ''}`}
              />
              <Text style={{ fontSize: px(11), color: C.faint, marginTop: px(2) }}>Datum: {invoiceDateLong}</Text>
              <Text style={{ fontSize: px(11), color: C.faint, marginTop: px(2) }}>
                Jägerstieg Hotel &amp; Pension · info@jaegerstieg.de
              </Text>
            </View>
          </View>

          <View style={s.legalGrid}>
            <View style={{ width: '50%' }}>
              <Text style={{ fontSize: px(11), fontWeight: 'bold', color: C.body }}>Bankverbindung: HASPA HAMBURG</Text>
              <Text style={{ fontSize: px(11), color: C.muted }}>Konto Inhaber: Aaron Eddie Cetin</Text>
              <Text style={{ fontSize: px(11), color: C.muted }}>IBAN: DE33 2005 0550 1501 0613 43</Text>
              <Text style={{ fontSize: px(11), color: C.muted }}>BIC: HASPDEHHXXX</Text>
            </View>
            <View style={{ width: '50%' }}>
              <Text style={{ fontSize: px(11), fontWeight: 'bold', color: C.body }}>Rechtliche Angaben</Text>
              <Text style={{ fontSize: px(11), color: C.muted }}>Amtsgericht Oldenburg HRB 200157</Text>
              <Text style={{ fontSize: px(11), color: C.muted }}>St.Nr.: 35 / 202 / 02346</Text>
              <Text style={{ fontSize: px(11), color: C.muted }}>USt-IdNr.: DE406004895</Text>
            </View>
          </View>

          <Text style={{ textAlign: 'center', fontSize: px(11), color: '#cbd5e1',
                         marginTop: px(8), borderTopWidth: 1, borderTopColor: C.hairer, paddingTop: px(8) }}>
            {m.isFreeform ? 'Vielen Dank für Ihren Auftrag!' : 'Vielen Dank für Ihren Aufenthalt!'} · Alle Preise inkl. MwSt.
          </Text>
        </View>
      </Page>
    </Document>
  )
}
