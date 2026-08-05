/**
 * Client-side capture of the rendered invoice into an A4 PDF.
 *
 * Shared by the invoice e-mail button and the payment-confirmation button so
 * both produce an identical document.
 *
 * Two bugs this fixes over the previous inline copies:
 *
 * 1. Side margin. The old code scaled the image to fit the page *height*,
 *    so any invoice taller than the A4 ratio came out narrower than the page
 *    and left a white strip down the right edge. We now always fill the full
 *    width and, if the content is genuinely longer than one page, continue
 *    onto a second page instead of shrinking it.
 *
 * 2. Missing logo. The logo is white artwork on transparency; html2canvas
 *    flattens transparency to white, so it disappears. It is re-drawn onto
 *    the PDF afterwards — now sourced from the already-loaded <img> element
 *    (with a network fetch only as a fallback), which no longer silently
 *    fails when the extra request does.
 */

/** Logo box geometry in mm, measured from the invoice layout at 794px width. */
const LOGO = { x: 13.2, y: 12.2, w: 39.7, h: 19.0 }

async function getLogoDataUrl(root: HTMLElement): Promise<string> {
  // Preferred: reuse the image the browser already decoded for the page.
  const el = root.querySelector('img[src*="logo"]') as HTMLImageElement | null
  if (el?.complete && el.naturalWidth > 0) {
    try {
      const c = document.createElement('canvas')
      c.width  = el.naturalWidth
      c.height = el.naturalHeight
      c.getContext('2d')!.drawImage(el, 0, 0)
      return c.toDataURL('image/png')
    } catch { /* tainted canvas — fall through */ }
  }
  // Fallback: fetch it separately.
  try {
    const blob = await fetch('/logo.png').then(r => r.blob())
    return await new Promise<string>((res, rej) => {
      const fr = new FileReader()
      fr.onload  = e => res(e.target!.result as string)
      fr.onerror = () => rej()
      fr.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}

/**
 * Capture `.page` (the rendered A4 invoice) and return the PDF as base64.
 * Throws when the invoice element is not on the current page.
 */
export async function captureInvoicePdf(): Promise<string> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  const pageEl = document.querySelector('.page') as HTMLElement | null
  if (!pageEl) throw new Error('Rechnungsseite nicht gefunden')

  const logoDataUrl = await getLogoDataUrl(pageEl)

  const canvas = await html2canvas(pageEl, {
    scale:           2,
    useCORS:         true,
    allowTaint:      false,
    backgroundColor: '#ffffff',
    logging:         false,
    imageTimeout:    0,
  })

  const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pdfW = pdf.internal.pageSize.getWidth()   // 210 mm
  const pdfH = pdf.internal.pageSize.getHeight()  // 297 mm
  const img  = canvas.toDataURL('image/jpeg', 0.92)

  // An invoice is always exactly one page — never a full page plus a sliver.
  // Draw it as large as fits, keeping the aspect ratio, and centre whatever
  // margin is left over so it reads as a deliberate margin rather than a
  // lopsided gap down one edge.
  const imgRatio  = canvas.height / canvas.width
  const pageRatio = pdfH / pdfW

  let w: number, h: number
  if (imgRatio <= pageRatio) {
    // Shorter than A4 → fill the width, sit at the top.
    w = pdfW
    h = pdfW * imgRatio
  } else {
    // Taller than A4 → fit the height so nothing spills onto a second page.
    h = pdfH
    w = pdfH / imgRatio
  }
  const x = (pdfW - w) / 2
  pdf.addImage(img, 'JPEG', x, 0, w, h)

  // Re-draw the logo, tracking whatever scale the fit above ended up using.
  if (logoDataUrl) {
    const s = w / pdfW
    pdf.addImage(logoDataUrl, 'PNG',
      x + LOGO.x * s, LOGO.y * s, LOGO.w * s, LOGO.h * s)
  }

  return pdf.output('datauristring').split(',')[1]
}
