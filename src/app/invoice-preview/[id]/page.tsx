import InvoiceDocument from '@/components/Invoice/InvoiceDocument'

export const dynamic = 'force-dynamic'

/**
 * Bare invoice for the preview iframe.
 *
 * Deliberately outside the (dashboard) route group: that layout adds the
 * sidebar and the mobile hamburger bar, which showed up *inside* the iframe
 * and put a second set of controls in the middle of the preview. Here the
 * document renders on its own. Auth still applies — middleware protects
 * everything except /order and /login.
 */
export default function InvoicePreviewPage({ params }: { params: { id: string } }) {
  return <InvoiceDocument id={params.id} />
}
