import InvoiceDocument from '@/components/Invoice/InvoiceDocument'

export const dynamic = 'force-dynamic'

/** Full invoice page: the document plus the action toolbar. */
export default function InvoicePrintPage({ params }: { params: { id: string } }) {
  return <InvoiceDocument id={params.id} showToolbar />
}
