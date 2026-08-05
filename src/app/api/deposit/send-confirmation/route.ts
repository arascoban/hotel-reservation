/**
 * POST /api/deposit/send-confirmation
 *
 * Sends the "thank you for your prepayment" e-mail. Never fires on its own —
 * it only runs when a staff member presses the button.
 *
 * Body:
 *   reservationId?  string   — send for a booking
 *   invoiceId?      string   — send for an invoice
 *   pdfBase64?      string   — invoice PDF captured client-side; when absent
 *                              the route builds a Buchungsbestätigung itself
 *
 * Attachment follows the "automatic" rule the hotel chose: whatever document
 * the deposit belongs to. The invoice page hands us the rendered invoice, a
 * booking without an invoice gets a generated confirmation.
 */

import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@/lib/supabase/server'
import { summarizeDeposit, formatDeDate, eur } from '@/lib/deposit'
import { buildConfirmationPdf } from '@/lib/confirmationPdf'

export const dynamic = 'force-dynamic'

function createTransporter() {
  return nodemailer.createTransport({
    host:   'smtp.strato.de',
    port:   465,
    secure: true,
    auth: {
      type: 'login',
      user: process.env.STRATO_SMTP_USER,
      pass: process.env.STRATO_SMTP_PASSWORD,
    },
    tls: { rejectUnauthorized: false },
  })
}

function greeting(salutation: string | null, surname: string): string {
  if (salutation === 'Herr') return `Sehr geehrter Herr ${surname}`
  if (salutation === 'Frau') return `Sehr geehrte Frau ${surname}`
  return `Sehr geehrte/r Frau/Herr ${surname}`
}

export async function POST(req: NextRequest) {
  try {
    const { reservationId, invoiceId, pdfBase64 } = await req.json()
    if (!reservationId && !invoiceId) {
      return NextResponse.json({ error: 'reservationId oder invoiceId erforderlich.' }, { status: 400 })
    }

    const supabase = await createClient()

    // ── Load the source document ────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let row: any
    let isInvoice = false
    let reference = ''
    let total = 0

    if (invoiceId) {
      const { data } = await supabase.from('invoices').select('*').eq('id', invoiceId).single()
      if (!data) return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 })
      row       = data
      isInvoice = true

      const customTotal = Array.isArray(row.line_items)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (row.line_items as any[]).reduce((s, i) => s + (i.qty ?? 0) * (i.unit_price ?? 0), 0)
        : 0
      total = (row.total_price ?? 0) + (row.room2_total_price ?? 0)
            + (row.room_service_total ?? 0) + customTotal - (row.discount ?? 0)

      const year = new Date(row.created_at).getFullYear().toString().slice(-2)
      reference  = `R${year}_${String(row.invoice_number).padStart(3, '0')}`
    } else {
      const { data } = await supabase
        .from('reservations').select('*, rooms(*, room_types(*))').eq('id', reservationId).single()
      if (!data) return NextResponse.json({ error: 'Reservierung nicht gefunden.' }, { status: 404 })
      row       = data
      total     = row.total_price ?? 0
      reference = `#${String(row.id).slice(0, 8).toUpperCase()}`
    }

    const guestEmail = row.guest_email
    if (!guestEmail) {
      return NextResponse.json({ error: 'Kein E-Mail für diesen Gast hinterlegt.' }, { status: 400 })
    }

    // ── Deposit must actually be recorded ───────────────────────────────────
    const dep = summarizeDeposit(row, total)
    if (!dep.paid) {
      return NextResponse.json(
        { error: 'Keine Anzahlung erfasst. Bitte zuerst Betrag und Zahlungsdatum eintragen.' },
        { status: 400 },
      )
    }

    const guestName = (row.guest_name ?? '').trim()
    const surname   = guestName.split(/\s+/).slice(-1)[0] || guestName
    const hello     = greeting(row.salutation ?? null, surname)
    const paidOn    = formatDeDate(dep.paidAt)

    // ── Wording ─────────────────────────────────────────────────────────────
    const restLine = dep.fullySettled
      ? 'Damit ist der Gesamtbetrag vollständig ausgeglichen — es ist keine weitere Zahlung erforderlich.'
      : `Der verbleibende Restbetrag von ${eur(dep.remaining)} ist wie vereinbart vor Ort bzw. bis zum Aufenthaltsende zu begleichen.`

    const subject = isInvoice
      ? `Zahlungsbestätigung – Anzahlung zu Rechnung ${reference}`
      : 'Zahlungsbestätigung – Wir haben Ihre Anzahlung erhalten'

    const text =
`${hello},

vielen Dank für Ihre Zahlung!

Wir bestätigen Ihnen den Eingang Ihrer Anzahlung in Höhe von ${eur(dep.paidAmount)}, eingegangen am ${paidOn} per ${dep.paidMethodLabel}.

${restLine}

Die vollständigen Unterlagen finden Sie im Anhang dieser E-Mail.

Bei Fragen stehen wir Ihnen jederzeit gerne zur Verfügung. Wir freuen uns darauf, Sie bei uns begrüßen zu dürfen.

Mit freundlichen Grüßen
Ihr Team vom Jägerstieg Hotel & Pension

Hotel-Pension Jägerstieg
Von Eichendorf-Str. 16 · 37539 Bad Grund
Tel: +49 5327 2828 · info@jaegerstieg.de`

    const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zahlungsbestätigung</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <tr>
          <td style="background:#1e293b;border-radius:16px 16px 0 0;padding:24px 32px;">
            <img src="https://i.ibb.co/m597972B/logo.png" alt="Jägerstieg Hotel &amp; Pension" width="120" height="60" style="display:block;object-fit:contain;" />
            <p style="margin:10px 0 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Zahlungsbestätigung</p>
          </td>
        </tr>

        <tr>
          <td style="background:white;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${hello},</p>
            <p style="margin:10px 0 0;font-size:15px;color:#475569;line-height:1.6;">
              vielen Dank für Ihre Zahlung! Wir bestätigen Ihnen hiermit den Eingang Ihrer Anzahlung.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;">
              <tr><td style="padding:18px 20px;">
                <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#15803d;">✓ Zahlung erhalten</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:13px;color:#166534;padding-bottom:6px;">Betrag</td>
                    <td style="font-size:18px;font-weight:800;color:#15803d;text-align:right;padding-bottom:6px;">${eur(dep.paidAmount)}</td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#166534;padding-bottom:4px;">Eingegangen am</td>
                    <td style="font-size:13px;font-weight:600;color:#166534;text-align:right;padding-bottom:4px;">${paidOn}</td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#166534;">Zahlungsart</td>
                    <td style="font-size:13px;font-weight:600;color:#166534;text-align:right;">${dep.paidMethodLabel}</td>
                  </tr>
                </table>
              </td></tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border:1px solid #e2e8f0;border-radius:12px;">
              <tr><td style="padding:16px 20px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:13px;color:#64748b;padding-bottom:6px;">Gesamtbetrag</td>
                    <td style="font-size:13px;color:#0f172a;font-weight:600;text-align:right;padding-bottom:6px;">${eur(total)}</td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#64748b;padding-bottom:6px;">Anzahlung</td>
                    <td style="font-size:13px;color:#15803d;font-weight:600;text-align:right;padding-bottom:6px;">− ${eur(dep.paidAmount)}</td>
                  </tr>
                  <tr>
                    <td style="font-size:15px;font-weight:700;color:#0f172a;padding-top:8px;border-top:1px solid #f1f5f9;">Restbetrag</td>
                    <td style="font-size:18px;font-weight:800;color:${dep.fullySettled ? '#15803d' : '#2563eb'};text-align:right;padding-top:8px;border-top:1px solid #f1f5f9;">${eur(dep.remaining)}</td>
                  </tr>
                </table>
              </td></tr>
            </table>

            <p style="margin:18px 0 0;font-size:14px;color:#475569;line-height:1.6;">${restLine}</p>
            <p style="margin:14px 0 0;font-size:14px;color:#475569;line-height:1.6;">
              Die vollständigen Unterlagen finden Sie im Anhang dieser E-Mail.
            </p>
            <p style="margin:14px 0 0;font-size:14px;color:#475569;line-height:1.6;">
              Bei Fragen stehen wir Ihnen jederzeit gerne zur Verfügung.
              Wir freuen uns darauf, Sie bei uns begrüßen zu dürfen.
            </p>
            <p style="margin:20px 0 0;font-size:14px;color:#475569;">
              Mit freundlichen Grüßen<br /><strong>Ihr Team vom Jägerstieg Hotel &amp; Pension</strong>
            </p>
          </td>
        </tr>

        <tr>
          <td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:13px;font-weight:600;color:#475569;">Hotel-Pension Jägerstieg</p>
            <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">Von Eichendorf-Str. 16 · 37539 Bad Grund</p>
            <p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">Tel: +49 5327 2828 · info@jaegerstieg.de</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body></html>`

    // ── Attachment ──────────────────────────────────────────────────────────
    // The invoice page captures the rendered invoice and sends it along.
    // Everything else gets a generated Buchungsbestätigung.
    let attachment: { filename: string; content: Buffer }
    if (pdfBase64) {
      attachment = {
        filename: `Rechnung_${reference}.pdf`,
        content:  Buffer.from(pdfBase64, 'base64'),
      }
    } else {
      attachment = {
        filename: `Buchungsbestaetigung_${reference.replace('#', '')}.pdf`,
        content:  buildConfirmationPdf({
          guestName,
          reference,
          street:   row.guest_street   ?? null,
          postcode: row.guest_postcode ?? null,
          city:     row.guest_city     ?? null,
          country:  row.guest_country  ?? null,
          roomName:   row.rooms?.name ?? row.room_name ?? null,
          roomNumber: row.rooms?.room_number ?? row.room_number ?? null,
          checkinAt:  row.checkin_at,
          checkoutAt: row.checkout_at,
          guestCount: row.guest_count ?? 1,
          breakfast:  !!row.breakfast_included,
          total,
          depositPaid:   dep.paidAmount,
          depositPaidAt: paidOn,
          depositMethod: dep.paidMethodLabel,
          remaining:     dep.remaining,
        }),
      }
    }

    // ── Send ────────────────────────────────────────────────────────────────
    await createTransporter().sendMail({
      from:    `"Jägerstieg Hotel & Pension" <${process.env.STRATO_SMTP_USER}>`,
      to:      guestEmail,
      bcc:     process.env.STRATO_SMTP_USER,
      subject,
      text,
      html,
      attachments: [attachment],
    })

    // Record that the confirmation went out, so the UI can show it.
    await supabase
      .from(isInvoice ? 'invoices' : 'reservations')
      .update({ deposit_email_sent_at: new Date().toISOString() })
      .eq('id', isInvoice ? invoiceId : reservationId)

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Fehler beim Senden.'
    console.error('deposit send-confirmation error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
