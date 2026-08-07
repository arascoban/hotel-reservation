import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/reservations'
import { summarizeLedger, summarizeDeposit, formatDeDate, eur as depEur, PAYMENT_KIND_LABELS, DEPOSIT_METHOD_LABELS, type PaymentRow } from '@/lib/deposit'
import { resolveEmailLogo, originFromRequest } from '@/lib/emailLogo'

// Parse time directly from the stored ISO string to avoid UTC conversion on the server.
// Timestamps are stored as +02:00 — new Date() would shift them by -2h in UTC Node.js.
// "2025-06-01T13:00:00+02:00" → "01.06.2025 13:00"
function localDT(iso: string): string {
  const [datePart, rest] = iso.split('T')
  const [y, m, d] = datePart.split('-')
  const time = rest.slice(0, 5)
  return `${d}.${m}.${y} ${time}`
}
import { differenceInCalendarDays } from 'date-fns'

const SOURCE_LABELS: Record<string, string> = {
  booking_com: 'Booking.com', expedia: 'Expedia', airbnb: 'Airbnb',
  walk_in: 'Laufkundschaft', phone: 'Telefon', email: 'E-Mail', website: 'Website', other: 'Sonstige',
}
const PAY_METHOD_LABELS: Record<string, string> = {
  cash: 'Bargeld', ec_card: 'EC-Karte', credit_card: 'Kreditkarte',
  card_verified: 'Karte verifiziert', online: 'Online', unpaid: 'Noch nicht bezahlt',
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
function getRoomFloor(roomNumber: string): string {
  const n = parseInt(roomNumber, 10)
  if ([21, 22, 23, 24].includes(n))               return '4. Etage'
  if ([15, 16, 17, 18, 19, 20].includes(n))       return '3. Etage'
  if ([11, 12, 14].includes(n))                   return '2. Etage'
  if (n === 10)                                   return '1. Etage'
  if (roomNumber === '04' || roomNumber === '05') return 'Pension'
  return ''
}

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
  includeKeys: boolean
  guestStreet:    string | null
  guestPostcode:  string | null
  guestCity:      string | null
  guestCountry:   string | null
  depositBlock:   string
  logoSrc:        string
  groupBlock:     string
}) {
  const {
    guestName, roomName, roomNumber, roomType,
    checkinAt, checkoutAt, guestCount, breakfastIncluded,
    source, paymentMethod, paymentStatus, totalPrice,
    notes, lockerNumber, lockerPin, reservationId, nights, includeKeys,
    guestStreet, guestPostcode, guestCity, guestCountry, depositBlock, logoSrc, groupBlock,
  } = opts

  // Build address block (only if at least one field is present)
  const addressLines = [
    guestStreet,
    [guestPostcode, guestCity].filter(Boolean).join(' ') || null,
    guestCountry,
  ].filter(Boolean) as string[]
  const addressBlock = addressLines.length > 0
    ? addressLines.map(l => `<p style="margin:1px 0;font-size:12px;color:#64748b;">${l}</p>`).join('')
    : ''


  const lockerSection = includeKeys && lockerNumber && lockerPin ? `
    <tr>
      <td style="padding:20px 0;border-bottom:1px solid #f1f5f9;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:12px;padding:20px;">
          <tr>
            <td>
              <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">🔐 Schlüsselabholung</p>
              <p style="margin:0 0 16px;font-size:13px;color:#cbd5e1;line-height:1.6;">
                Ihre Zimmerschlüssel befinden sich im Schließfach Nr. <strong style="color:white;">${lockerNumber}</strong> an der Rezeption.
                Bitte öffnen Sie das Schließfach mit dem folgenden PIN-Code:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:white;">
                    <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">Schließfach Nr.</p>
                    <p style="margin:0;font-size:28px;font-weight:800;color:white;">${lockerNumber}</p>
                  </td>
                  <td style="text-align:right;color:white;">
                    <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;">Ihr PIN-Code</p>
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
          <td style="background:#1e293b;border-radius:16px 16px 0 0;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">
                  <img src="${logoSrc}" alt="Jägerstieg Hotel &amp; Pension" width="120" height="60" style="display:block;object-fit:contain;" />
                  <p style="margin:10px 0 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Buchungsbestätigung</p>
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
                  ${addressBlock ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #f1f5f9;">${addressBlock}</div>` : ''}
                </td>
              </tr>

              <!-- Zimmer -->
              <tr>
                <td style="padding:20px 0;border-bottom:1px solid #f1f5f9;">
                  <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Zimmer</p>
                  <p style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">${roomName}</p>
                  <p style="margin:2px 0 0;font-size:13px;color:#64748b;">${getRoomFloor(roomNumber)} · ${roomType}</p>
                  <p style="margin:6px 0 0;font-size:13px;color:#64748b;">${guestCount} Person${guestCount !== 1 ? 'en' : ''}</p>
                  ${breakfastIncluded ? `<p style="margin:6px 0 0;display:inline-block;background:#fef3c7;color:#92400e;border-radius:20px;padding:3px 10px;font-size:12px;font-weight:600;">☕ Frühstück inklusive</p>` : ''}
                </td>
              </tr>

              <!-- Weitere Zimmer der Gruppenbuchung -->
              ${groupBlock}

              <!-- Aufenthalt -->
              <tr>
                <td style="padding:20px 0;border-bottom:1px solid #f1f5f9;">
                  <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Aufenthalt</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="40%">
                        <p style="margin:0;font-size:12px;color:#64748b;">Check-in</p>
                        <p style="margin:3px 0 0;font-size:15px;font-weight:600;color:#0f172a;">${localDT(checkinAt)}</p>
                      </td>
                      <td width="20%" style="text-align:center;vertical-align:middle;">
                        <p style="margin:0;font-size:20px;font-weight:800;color:#0f172a;">${nights}</p>
                        <p style="margin:2px 0 0;font-size:11px;color:#94a3b8;">Nacht${nights !== 1 ? 'e' : ''}</p>
                      </td>
                      <td width="40%" style="text-align:right;">
                        <p style="margin:0;font-size:12px;color:#64748b;">Check-out</p>
                        <p style="margin:3px 0 0;font-size:15px;font-weight:600;color:#0f172a;">${localDT(checkoutAt)}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Locker PIN (after Aufenthalt, before Zahlung) -->
              ${lockerSection}

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

              <!-- Anzahlung -->
              ${depositBlock}

              ${notes ? `
              <!-- Notes -->
              <tr>
                <td style="padding:16px 0;border-bottom:1px solid #f1f5f9;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Notizen</p>
                  <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">${notes}</p>
                </td>
              </tr>` : ''}

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
    const { reservationId, includeKeys = true } = await req.json()
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

    // ── Zahlungen block ─────────────────────────────────────────────────────
    // Lists every payment recorded against this booking so the confirmation
    // always shows what has been received and what is still open.
    // A group booking shares one deposit, one payment ledger and one total
    // across all its rooms, so resolve them over the whole group — the
    // confirmation must look the same whichever room it is sent from.
    // Both a group and a family booking span several rooms and are one
    // booking to the guest, so the confirmation covers all of them.
    let groupRows: any[] = []
    const isFamily = !r.group_booking_id && !!r.family_booking_id
    if (r.group_booking_id || r.family_booking_id) {
      const q = supabase
        .from('reservations')
        .select('id, checkin_at, checkout_at, guest_count, child_count, total_price, deposit_mode, deposit_percent, deposit_amount, deposit_due_date, rooms(name, room_number, room_types(name))')
        .is('deleted_at', null)
        .order('checkin_at')
      const { data } = r.group_booking_id
        ? await q.eq('group_booking_id',  r.group_booking_id)
        : await q.eq('family_booking_id', r.family_booking_id)
      groupRows = data ?? []
    }

    const isGroup    = groupRows.length > 1
    const depositRow = groupRows.find(g => g.deposit_amount != null || g.deposit_mode) ?? r
    // A family booking stores the same price on both of its rows, so summing
    // would double it — count it once. A group prices each room separately.
    const billTotal  = !isGroup
      ? (r.total_price ?? 0)
      : isFamily
        ? (groupRows[0]?.total_price ?? 0)
        : groupRows.reduce((sum, g) => sum + (g.total_price ?? 0), 0)

    const payQuery = supabase.from('payments').select('*')
    const { data: payRows } = isGroup
      ? await payQuery.in('reservation_id', groupRows.map(g => g.id)).order('paid_on')
      : await payQuery.eq('reservation_id', reservationId).order('paid_on')

    const dep = summarizeLedger((payRows ?? []) as PaymentRow[], billTotal)
    const reqDeposit = summarizeDeposit(depositRow, billTotal)
    let depositBlock = ''

    // Nothing received yet, but a deposit was requested → ask for it, with the
    // bank details the guest needs to actually pay.
    if (dep.payments.length === 0 && reqDeposit.required) {
      const due = depositRow.deposit_due_date
        ? ` Bitte überweisen Sie den Betrag bis zum <strong>${formatDeDate(depositRow.deposit_due_date)}</strong>.`
        : ''
      depositBlock = `
              <tr>
                <td style="padding:20px 0;border-bottom:1px solid #f1f5f9;">
                  <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Anzahlung</p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
                    <tr><td style="padding:14px 16px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="font-size:13px;color:#1e40af;">Erforderliche Anzahlung</td>
                          <td style="font-size:18px;font-weight:800;color:#2563eb;text-align:right;">${depEur(reqDeposit.requiredAmount)}</td>
                        </tr>
                      </table>
                      <p style="margin:10px 0 0;font-size:12px;color:#1e40af;line-height:1.6;">
                        Zur verbindlichen Bestätigung Ihrer Buchung bitten wir um eine Anzahlung.${due}
                      </p>
                      <p style="margin:8px 0 0;font-size:12px;color:#1e40af;line-height:1.5;">
                        <strong>Bankverbindung:</strong> HASPA HAMBURG · Aaron Eddie Cetin<br />
                        IBAN: DE33 2005 0550 1501 0613 43 · BIC: HASPDEHHXXX
                      </p>
                    </td></tr>
                  </table>
                </td>
              </tr>`
    } else if (dep.payments.length > 0) {
      depositBlock = `
              <tr>
                <td style="padding:20px 0;border-bottom:1px solid #f1f5f9;">
                  <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">Zahlungen</p>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
                    <tr><td style="padding:14px 16px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        ${dep.payments.map(pm => `
                        <tr>
                          <td style="font-size:13px;color:#166534;padding:3px 0;">${formatDeDate(pm.paid_on)} · ${PAYMENT_KIND_LABELS[pm.kind]} · ${DEPOSIT_METHOD_LABELS[pm.method] ?? pm.method}</td>
                          <td style="font-size:15px;font-weight:700;color:${pm.kind === 'refund' ? '#dc2626' : '#15803d'};text-align:right;padding:3px 0;">${pm.kind === 'refund' ? '+' : '−'} ${depEur(Number(pm.amount))}</td>
                        </tr>`).join('')}
                        ${reqDeposit.required && dep.totalPaid + 0.004 < reqDeposit.requiredAmount ? `
                        <tr>
                          <td colspan="2" style="font-size:12px;color:#b45309;padding-top:8px;">
                            Offene Anzahlung: ${depEur(reqDeposit.requiredAmount - dep.totalPaid)}
                          </td>
                        </tr>` : ''}
                        <tr>
                          <td style="font-size:13px;color:#166534;padding-top:8px;border-top:1px solid #bbf7d0;">Restbetrag</td>
                          <td style="font-size:15px;font-weight:700;color:#166534;text-align:right;padding-top:8px;border-top:1px solid #bbf7d0;">${depEur(dep.remaining)}</td>
                        </tr>
                      </table>
                    </td></tr>
                  </table>
                </td>
              </tr>`
    }

    // A group booking is confirmed once, listing every room it covers.
    let groupBlock = ''
    if (isGroup) {
      const rows = groupRows
      {
        const totalRooms  = rows.length
        const totalGuests = isFamily
          ? (rows[0]?.guest_count ?? 0)
          : rows.reduce((sum, g) => sum + (g.guest_count ?? 0), 0)
        const grandTotal  = billTotal

        const roomRows = rows.map(g => {
          const kids = g.child_count ?? 0
          const adults = (g.guest_count ?? 1) - kids
          return `
                    <tr>
                      <td style="font-size:13px;color:#0f172a;padding:6px 0;border-bottom:1px solid #f1f5f9;">
                        <strong>Zimmer ${g.rooms?.room_number ?? ''}</strong>
                        <span style="color:#64748b;"> · ${g.rooms?.room_types?.name ?? g.rooms?.name ?? ''}</span><br />
                        <span style="font-size:12px;color:#94a3b8;">
                          ${localDT(g.checkin_at).slice(0, 10)} – ${localDT(g.checkout_at).slice(0, 10)} ·
                          ${adults} Erw.${kids > 0 ? ` + ${kids} Kind${kids !== 1 ? 'er' : ''}` : ''}
                        </span>
                      </td>
                      <td style="font-size:13px;font-weight:700;color:#0f172a;text-align:right;padding:6px 0;border-bottom:1px solid #f1f5f9;">
                        ${isFamily ? '' : (g.total_price != null ? depEur(g.total_price) : '—')}
                      </td>
                    </tr>`
        }).join('')

        groupBlock = `
              <tr>
                <td style="padding:20px 0;border-bottom:1px solid #f1f5f9;">
                  <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;">
                    ${isFamily ? 'Familienzimmer' : 'Gruppenbuchung'} · ${totalRooms} Zimmer · ${totalGuests} Personen
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${roomRows}
                    <tr>
                      <td style="font-size:14px;font-weight:700;color:#0f172a;padding-top:10px;">Gesamtpreis</td>
                      <td style="font-size:18px;font-weight:800;color:#2563eb;text-align:right;padding-top:10px;">${depEur(grandTotal)}</td>
                    </tr>
                  </table>
                </td>
              </tr>`
      }
    }

    const logo = await resolveEmailLogo(originFromRequest(req))

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
      lockerNumber:      r.rooms.room_number,
      lockerPin:         r.rooms.locker_pin,
      reservationId:     r.id,
      nights,
      includeKeys,
      guestStreet:   r.guest_street   ?? null,
      guestPostcode: r.guest_postcode ?? null,
      guestCity:     r.guest_city     ?? null,
      guestCountry:  r.guest_country  ?? null,
      depositBlock,
      logoSrc: logo.src,
      groupBlock,
    })

    const transporter = createTransporter()

    await transporter.sendMail({
      from:    `"Jägerstieg Hotel & Pension" <${process.env.STRATO_SMTP_USER}>`,
      to:      r.guest_email,
      bcc:     process.env.STRATO_SMTP_USER, // copy to own inbox → appears in sent/inbox
      subject: `Buchungsbestätigung – ${r.rooms.name} · ${formatDate(r.checkin_at)}–${formatDate(r.checkout_at)}`,
      html,
      attachments: logo.attachments,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('send-confirmation error:', err)
    return NextResponse.json({ error: err.message ?? 'Fehler beim Senden.' }, { status: 500 })
  }
}
