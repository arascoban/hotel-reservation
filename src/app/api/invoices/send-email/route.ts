import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

// Strato SMTP transporter (same config as send-confirmation)
function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.strato.de',
    port: 465,
    secure: true,
    auth: {
      type: 'login',
      user: process.env.STRATO_SMTP_USER,
      pass: process.env.STRATO_SMTP_PASSWORD,
    },
    tls: { rejectUnauthorized: false },
  })
}

export async function POST(req: NextRequest) {
  try {
    const { pdfBase64, guestEmail, salutation, guestSurname, checkinStr, checkoutStr, invoiceRef } =
      await req.json()

    if (!guestEmail)  return NextResponse.json({ error: 'Kein E-Mail hinterlegt.' }, { status: 400 })
    if (!pdfBase64)   return NextResponse.json({ error: 'PDF fehlt.'             }, { status: 400 })

    if (!process.env.STRATO_SMTP_USER || !process.env.STRATO_SMTP_PASSWORD) {
      return NextResponse.json(
        { error: 'SMTP nicht konfiguriert. Bitte STRATO_SMTP_USER und STRATO_SMTP_PASSWORD setzen.' },
        { status: 500 },
      )
    }

    // Build gender-correct salutation
    const greeting =
      salutation === 'Herr' ? `Sehr geehrter Herr ${guestSurname}` :
      salutation === 'Frau' ? `Sehr geehrte Frau ${guestSurname}`  :
      `Sehr geehrte/r Frau/Herr ${guestSurname}`

    const subject =
      `Ihre Rechnung für Ihren Aufenthalt vom ${checkinStr} bis ${checkoutStr}`

    const text =
      `${greeting},\n\n` +
      `vielen Dank für Ihren Aufenthalt in unserem Hotel.\n\n` +
      `Anbei erhalten Sie die Rechnung für Ihren Aufenthalt vom ${checkinStr} bis ${checkoutStr}.\n\n` +
      `Sollten Sie Fragen zur Rechnung haben oder weitere Informationen benötigen, stehen wir Ihnen selbstverständlich jederzeit gerne zur Verfügung.\n\n` +
      `Wir würden uns sehr freuen, Sie bald wieder bei uns begrüßen zu dürfen.\n\n` +
      `Mit freundlichen Grüßen,\n` +
      `Hotel Jägerstieg`

    const filename = invoiceRef
      ? `Rechnung_${invoiceRef}.pdf`
      : `Rechnung_${checkinStr.replace(/\./g, '-')}_${checkoutStr.replace(/\./g, '-')}.pdf`

    const transporter = createTransporter()
    await transporter.sendMail({
      from:    `"Jägerstieg Hotel & Pension" <${process.env.STRATO_SMTP_USER}>`,
      to:      guestEmail,
      subject,
      text,
      attachments: [
        {
          filename,
          content:     Buffer.from(pdfBase64, 'base64'),
          contentType: 'application/pdf',
        },
      ],
    })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler'
    console.error('send-invoice-email error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
