import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatDateTime } from '@/lib/reservations'
import { differenceInCalendarDays } from 'date-fns'

const SOURCE_LABELS: Record<string, string> = {
  booking_com: 'Booking.com', expedia: 'Expedia', airbnb: 'Airbnb',
  walk_in: 'Laufkundschaft', phone: 'Telefon', website: 'Website', other: 'Sonstige',
}
const PAY_METHOD_LABELS: Record<string, string> = {
  cash: 'Bargeld', ec_card: 'EC-Karte', credit_card: 'Kreditkarte',
  online: 'Online', unpaid: 'Noch nicht bezahlt',
}
const PAY_STATUS_LABELS: Record<string, string> = {
  paid: 'Bezahlt', deposit_paid: 'Anzahlung bezahlt',
  unpaid: 'Ausstehend', refunded: 'Erstattet',
}

// ── Strato SMTP transporter ────────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.strato.de',
    port: 465,
    secure: true,       // SSL/TLS (official Strato recommendation)
    auth: {
      type: 'login',
      user: process.env.STRATO_SMTP_USER,
      pass: process.env.STRATO_SMTP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  })
}

// ── HTML email template ────────────────────────────────────────────────────────
function buildEmailHtml(opts: {
  guestName: string
  roomName: string
  roomNumber: string
  roomType: string
  checkinAt: string
  checkoutAt: string
  guestCount: number
  breakfastIncluded: boolean
  source: string
  paymentMethod: string
  paymentStatus: string
  totalPrice: number | null
  notes: string | null
  externalId: string | null
  lockerNumber?: string
  lockerPin?: string
  reservationId: string
  nights: number
}) {
  const {
    guestName, roomName, roomNumber, roomType,
    checkinAt, checkoutAt, guestCount, breakfastIncluded,
    source, paymentMethod, paymentStatus, totalPrice,
    notes, lockerNumber, lockerPin, reservationId, nights,
  } = opts

  const lockerSection = lockerNumber && lockerPin ? `
    <tr>
      <td style="padding: 8px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:12px;padding:20px;">
          <tr>
            <td>
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">🔐 Ihr Schließfach</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:white;">
                    <p style="margin:4px 0;font-size:14px;color:#cbd5e1;">Schließfach Nr.</p>
                    <p style="margin:0;font-size:28px;font-weight:800;color:white;">${lockerNumber}</p>
                  </td>
                  <td style="text-align:right;color:white;">
                    <p style="margin:4px 0;font-size:14px;color:#cbd5e1;">PIN-Code</p>
                    <p style="margin:0;font-size:36px;font-weight:800;color:white;letter-spacing:6px;font-family:monospace;">${lockerPin}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0;font-size:11px;color:#64748b;">Bitte bewahren Sie diesen Code vertraulich auf.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>` : ''

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Buchungsbestätigung</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#1e293b;border-radius:16px 16px 0 0;padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Buchungsbestätigung</p>
                  <p style="margin:4px 0 0;font-size:24px;font-weight:800;color:white;">Jägerstieg Hotel &amp; Pension</p>
                </td>
                <td style="text-align:right;vertical-align:top;">
                  <p style="margin:0;font-size:11px;color:#64748b;">Buchungs-Nr.</p>
                  <p style="margin:2px 0 0;font-size:14px;font-weight:700;color:#94a3b8;font-family:monospace;">#${reservationId.slice(0,8).toUpperCase()}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:white;padding:32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            <table width="100%" cellpadding="0" cellspacing="0">

              <!-- Greeting -->
              <tr>
                <td style="padding-bottom:24px;border-bottom:1px solid #f1f5f9;">
                  <p style="margin:0;font-size:20px;font-weight:700;color:#0f172a;">Liebe/r ${guestName},</p>
                  <p style="margin:8px 0 0;font-size:15px;color:#475569;line-height:1.6;">vielen Dank für Ihre Buchung! Wir freuen uns auf Ihren Aufenthalt und bestätigen Ihre Reservierung wie folgt:</p>
                </td>
              </tr>

              <!-- Room + Dates -->
              <tr>
                <td style="padding:24px 0;border-bottom:1px solid #f1f5f9;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="50%" style="vertical-align:top;padding-right:12px;">
                        <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Zimmer</p>
                        <p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">${roomName}</p>
                        <p style="margin:2px 0 0;font-size:13px;color:#64748b;">Zimmer ${roomNumber} · ${roomType}</p>
                        <p style="margin:6px 0 0;font-size:13px;color:#64748b;">${guestCount} Person${guestCount !== 1 ? 'en' : ''}${breakfastIncluded ? ' · ☕ Frühstück' : ''}</p>
                      </td>
                      <td width="50%" style="vertical-align:top;padding-left:12px;">
                        <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Aufenthalt</p>
                        <p style="margin:0;font-size:13px;color:#64748b;">Check-in</p>
                        <p style="margin:2px 0 8px;font-size:15px;font-weight:600;color:#0f172a;">${formatDateTime(checkinAt)}</p>
                        <p style="margin:0;font-size:13px;color:#64748b;">Check-out</p>
                        <p style="margin:2px 0 0;font-size:15px;font-weight:600;color:#0f172a;">${formatDateTime(checkoutAt)}</p>
                        <p style="margin:6px 0 0;font-size:12px;color:#94a3b8;">${nights} Nacht${nights !== 1 ? 'e' : ''}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Payment -->
              <tr>
                <td style="padding:20px 0;border-bottom:1px solid #f1f5f9;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td>
                        <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Zahlung</p>
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="font-size:13px;color:#64748b;padding-bottom:6px;">Zahlungsmethode</td>
                            <td style="font-size:13px;color:#0f172a;font-weight:600;text-align:right;padding-bottom:6px;">${PAY_METHOD_LABELS[paymentMethod] ?? paymentMethod}</td>
                          </tr>
                          <tr>
                            <td style="font-size:13px;color:#64748b;padding-bottom:6px;">Zahlungsstatus</td>
                            <td style="font-size:13px;color:#0f172a;font-weight:600;text-align:right;padding-bottom:6px;">${PAY_STATUS_LABELS[paymentStatus] ?? paymentStatus}</td>
                          </tr>
                          ${totalPrice != null ? `
                          <tr>
                            <td style="font-size:15px;font-weight:700;color:#0f172a;padding-top:8px;border-top:1px solid #f1f5f9;">Gesamtpreis</td>
                            <td style="font-size:18px;font-weight:800;color:#2563eb;text-align:right;padding-top:8px;border-top:1px solid #f1f5f9;">€${totalPrice.toFixed(2)}</td>
                          </tr>` : ''}
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              ${notes ? `
              <!-- Notes -->
              <tr>
                <td style="padding:16px 0;border-bottom:1px solid #f1f5f9;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Notizen</p>
                  <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">${notes}</p>
                </td>
              </tr>` : ''}

              <!-- Locker PIN -->
              ${lockerSection}

              <!-- Source note -->
              <tr>
                <td style="padding-top:20px;">
                  <p style="margin:0;font-size:12px;color:#94a3b8;">Buchungsquelle: ${SOURCE_LABELS[source] ?? source}</p>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:13px;font-weight:600;color:#475569;">Jägerstieg Hotel &amp; Pension</p>
            <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">info@jaegerstieg.de</p>
            <p style="margin:12px 0 0;font-size:11px;color:#cbd5e1;">Wir freuen uns auf Ihren Besuch!</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ── POST /api/send-confirmation ────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { reservationId } = await req.json()
    if (!reservationId) return NextResponse.json({ error: 'Missing reservationId' }, { status: 400 })

    // Fetch reservation
    const supabase = await createClient()
    const { data: resData, error: resErr } = await supabase
      .from('reservations')
      .select('*, rooms(*, room_types(*))')
      .eq('id', reservationId)
      .single()

    if (resErr || !resData) return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })

    const r = resData as any

    if (!r.guest_email) {
      return NextResponse.json({ error: 'Kein E-Mail hinterlegt.' }, { status: 400 })
    }

    const nights = differenceInCalendarDays(new Date(r.checkout_at), new Date(r.checkin_at))

    const html = buildEmailHtml({
      guestName:         r.guest_name,
      roomName:          r.rooms.name,
      roomNumber:        r.rooms.room_number,
      roomType:          r.rooms.room_types.name,
      checkinAt:         r.checkin_at,
      checkoutAt:        r.checkout_at,
      guestCount:        r.guest_count,
      breakfastIncluded: r.breakfast_included,
      source:            r.source,
      paymentMethod:     r.payment_method,
      paymentStatus:     r.payment_status,
      totalPrice:        r.total_price,
      notes:             r.notes,
      externalId:        r.external_id,
      lockerNumber:      r.rooms.room_number,   // locker = same as room number
      lockerPin:         r.rooms.locker_pin,
      reservationId:     r.id,
      nights,
    })

    const transporter = createTransporter()

    await transporter.sendMail({
      from:    `"Jägerstieg Hotel & Pension" <${process.env.STRATO_SMTP_USER}>`,
      to:      r.guest_email,
      subject: `Buchungsbestätigung – ${r.rooms.name} · ${formatDate(r.checkin_at)}–${formatDate(r.checkout_at)}`,
      html,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('send-confirmation error:', err)
    return NextResponse.json({ error: err.message ?? 'Fehler beim Senden.' }, { status: 500 })
  }
}
