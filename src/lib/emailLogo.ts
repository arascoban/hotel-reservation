/**
 * Logo for outgoing e-mails.
 *
 * Why not a hosted URL: the templates used to point at a free image host
 * (i.ibb.co). Gmail hides that problem because it proxies and caches remote
 * images on googleusercontent.com — once fetched, it keeps showing its own
 * copy. Clients that fetch directly (Strato webmail, Outlook, Apple Mail with
 * remote content enabled) hit the host every time and get "image not found"
 * as soon as it rate-limits, blocks hotlinking or drops the upload.
 *
 * Why not a data: URI: Gmail strips `data:` image sources in e-mail bodies,
 * so the logo would break in the one client that currently works.
 *
 * A CID attachment embeds the image in the message itself. No external
 * request, nothing to expire, and it renders even when a client blocks
 * remote content — the standard approach for transactional mail.
 */

import fs from 'fs'
import path from 'path'

export const LOGO_CID = 'jaegerstieg-logo'

/** Remote copy, used only if the file cannot be read for some reason. */
const REMOTE_FALLBACK = 'https://i.ibb.co/m597972B/logo.png'

export interface EmailLogo {
  /** Put straight into <img src="…"> */
  src: string
  /** Spread into nodemailer's `attachments` (empty when falling back). */
  attachments: { filename: string; content: Buffer; cid: string; contentType: string }[]
}

let cached: Buffer | null = null

/** Read public/logo.png, trying the paths a Next.js server may run from. */
function readLogoFile(): Buffer | null {
  if (cached) return cached
  const candidates = [
    path.join(process.cwd(), 'public', 'logo.png'),
    path.join(process.cwd(), '.next', 'standalone', 'public', 'logo.png'),
    path.join(process.cwd(), '..', 'public', 'logo.png'),
  ]
  for (const p of candidates) {
    try {
      const buf = fs.readFileSync(p)
      if (buf?.length) { cached = buf; return cached }
    } catch { /* try the next path */ }
  }
  return null
}

/**
 * Build the logo reference for an e-mail.
 *
 * `origin` — the app's own base URL (e.g. from the incoming request). When
 * the file cannot be read from disk we fetch it over HTTP from there, which
 * covers serverless deployments that do not ship `public/` into the function
 * bundle. Only if that also fails do we fall back to the remote host.
 */
export async function resolveEmailLogo(origin?: string | null): Promise<EmailLogo> {
  let buf = readLogoFile()

  if (!buf && origin) {
    try {
      const res = await fetch(new URL('/logo.png', origin).toString())
      if (res.ok) {
        const ab = await res.arrayBuffer()
        if (ab.byteLength) { buf = Buffer.from(ab); cached = buf }
      }
    } catch { /* fall through */ }
  }

  if (!buf) return { src: REMOTE_FALLBACK, attachments: [] }

  return {
    src: `cid:${LOGO_CID}`,
    attachments: [{
      filename:    'logo.png',
      content:     buf,
      cid:         LOGO_CID,
      contentType: 'image/png',
    }],
  }
}

/** Origin of the incoming request, for the HTTP fallback above. */
export function originFromRequest(req: Request): string | null {
  try {
    const h = req.headers
    const host  = h.get('x-forwarded-host') ?? h.get('host')
    const proto = h.get('x-forwarded-proto') ?? 'https'
    return host ? `${proto}://${host}` : null
  } catch {
    return null
  }
}
