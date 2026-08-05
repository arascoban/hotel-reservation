/**
 * Server-side Buchungsbestätigung PDF.
 *
 * Drawn programmatically with jsPDF rather than screenshotting a page: this
 * runs on Vercel with no browser, so the deposit e-mail can be sent from the
 * reservation modal where no rendered document exists.
 *
 * Layout mirrors the invoice PDF (same header block, same footer data) so a
 * guest receives a consistent-looking set of documents.
 */

import { jsPDF } from 'jspdf'

export interface ConfirmationPdfData {
  guestName:  string
  reference:  string
  street:     string | null
  postcode:   string | null
  city:       string | null
  country:    string | null
  roomName:   string | null
  roomNumber: string | null
  checkinAt:  string
  checkoutAt: string
  guestCount: number
  breakfast:  boolean
  total:      number
  depositPaid:   number
  depositPaidAt: string
  depositMethod: string
  remaining:     number
}

const EUR = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'

/** "2026-08-05T13:00:00+02:00" → "05.08.2026 13:00" (no UTC shifting). */
function localDT(iso: string): string {
  if (!iso) return ''
  const [datePart, rest] = iso.split('T')
  const [y, m, d] = datePart.split('-')
  const time = (rest ?? '').slice(0, 5)
  return time ? `${d}.${m}.${y} ${time}` : `${d}.${m}.${y}`
}

export function buildConfirmationPdf(data: ConfirmationPdfData): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210
  const M = 18                     // page margin
  let y = 20

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, W, 4, 'F')

  doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(15, 23, 42)
  doc.text('BUCHUNGSBESTÄTIGUNG', M, y)

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100, 116, 139)
  doc.text('Hotel-Pension Jägerstieg', W - M, y - 4, { align: 'right' })
  doc.text('Von Eichendorf-Str. 16, 37539 Bad Grund', W - M, y, { align: 'right' })
  doc.text('Tel: +49 5327 2828 · info@jaegerstieg.de', W - M, y + 4, { align: 'right' })

  y += 12
  doc.setDrawColor(30, 41, 59).setLineWidth(0.6).line(M, y, W - M, y)
  y += 9

  // ── Reference + guest ─────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100, 116, 139)
  doc.text(`Referenz: ${data.reference}`, M, y)
  doc.text(`Datum: ${new Date().toLocaleDateString('de-DE')}`, W - M, y, { align: 'right' })
  y += 9

  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(15, 23, 42)
  doc.text(data.guestName, M, y)
  y += 5

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(71, 85, 105)
  for (const line of [
    data.street,
    [data.postcode, data.city].filter(Boolean).join(' ') || null,
    data.country,
  ].filter(Boolean) as string[]) {
    doc.text(line, M, y)
    y += 5
  }
  y += 6

  // ── Stay details ──────────────────────────────────────────────────────────
  const rows: [string, string][] = []
  if (data.roomName) {
    rows.push(['Zimmer', data.roomNumber ? `${data.roomName} (Nr. ${data.roomNumber})` : data.roomName])
  }
  rows.push(['Anreise',  localDT(data.checkinAt)])
  rows.push(['Abreise',  localDT(data.checkoutAt)])
  rows.push(['Personen', String(data.guestCount)])
  rows.push(['Frühstück', data.breakfast ? 'inklusive' : 'nicht inklusive'])

  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(15, 23, 42)
  doc.text('Ihre Buchung', M, y)
  y += 6

  doc.setFontSize(10)
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'normal').setTextColor(100, 116, 139)
    doc.text(label, M, y)
    doc.setFont('helvetica', 'bold').setTextColor(15, 23, 42)
    doc.text(value, W - M, y, { align: 'right' })
    y += 6
  }

  y += 4
  doc.setDrawColor(226, 232, 240).setLineWidth(0.3).line(M, y, W - M, y)
  y += 10

  // ── Payment summary ───────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(15, 23, 42)
  doc.text('Zahlungsübersicht', M, y)
  y += 7

  const money: [string, string, [number, number, number], boolean][] = [
    ['Gesamtbetrag', EUR(data.total), [15, 23, 42], false],
    [`Anzahlung erhalten am ${data.depositPaidAt} (${data.depositMethod})`,
     `- ${EUR(data.depositPaid)}`, [21, 128, 61], false],
  ]
  for (const [label, value, color, bold] of money) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(10).setTextColor(100, 116, 139)
    doc.text(label, M, y)
    doc.setFont('helvetica', 'bold').setTextColor(color[0], color[1], color[2])
    doc.text(value, W - M, y, { align: 'right' })
    y += 6
  }

  y += 2
  const settled = data.remaining <= 0.004
  doc.setFillColor(settled ? 240 : 241, settled ? 253 : 245, settled ? 244 : 249)
  doc.roundedRect(M, y, W - 2 * M, 14, 2, 2, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(15, 23, 42)
  doc.text('Restbetrag', M + 5, y + 9)
  doc.setFontSize(14).setTextColor(settled ? 21 : 37, settled ? 128 : 99, settled ? 61 : 235)
  doc.text(EUR(data.remaining), W - M - 5, y + 9, { align: 'right' })
  y += 22

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100, 116, 139)
  const note = settled
    ? 'Der Gesamtbetrag ist vollständig ausgeglichen. Es ist keine weitere Zahlung erforderlich.'
    : 'Der Restbetrag ist wie vereinbart vor Ort bzw. bis zum Aufenthaltsende zu begleichen.'
  doc.text(doc.splitTextToSize(note, W - 2 * M), M, y)
  y += 12

  doc.setFontSize(10).setTextColor(71, 85, 105)
  doc.text('Vielen Dank für Ihre Buchung. Wir freuen uns auf Ihren Aufenthalt!', M, y)

  // ── Footer ────────────────────────────────────────────────────────────────
  const fy = 262
  doc.setDrawColor(226, 232, 240).setLineWidth(0.3).line(M, fy, W - M, fy)
  doc.setFontSize(8).setTextColor(148, 163, 184)

  doc.setFont('helvetica', 'bold')
  doc.text('Bankverbindung: HASPA HAMBURG', M, fy + 6)
  doc.setFont('helvetica', 'normal')
  doc.text('Konto Inhaber: Aaron Eddie Cetin', M, fy + 10)
  doc.text('IBAN: DE33 2005 0550 1501 0613 43', M, fy + 14)
  doc.text('BIC: HASPDEHHXXX', M, fy + 18)

  doc.setFont('helvetica', 'bold')
  doc.text('Rechtliche Angaben', W - M, fy + 6, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.text('Amtsgericht Oldenburg HRB 200157', W - M, fy + 10, { align: 'right' })
  doc.text('St.Nr.: 35 / 202 / 02346', W - M, fy + 14, { align: 'right' })
  doc.text('USt-IdNr.: DE406004895', W - M, fy + 18, { align: 'right' })

  return Buffer.from(doc.output('arraybuffer'))
}
