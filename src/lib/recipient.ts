/**
 * Who a booking confirmation or an invoice is addressed to.
 *
 * A guest may book privately or for their company. The choice only decides
 * which name goes on the first line: when a company is on file it is always
 * named in the address block, because that is what the guest expects to see
 * on the paperwork either way.
 */

export type BillTo = 'person' | 'company'

export const BILL_TO_OPTIONS: { value: BillTo; label: string }[] = [
  { value: 'person',  label: 'Kunde' },
  { value: 'company', label: 'Firma' },
]

export interface RecipientSource {
  /** The guest's full name. */
  name:      string
  street?:   string | null
  postcode?: string | null
  city?:     string | null
  country?:  string | null

  companyName?:     string | null
  vatId?:           string | null
  companyStreet?:   string | null
  companyPostcode?: string | null
  companyCity?:     string | null
  companyCountry?:  string | null
}

export interface Recipient {
  /** First line of the address block. */
  name:  string
  /** Everything under it, already ordered and free of blanks. */
  lines: string[]
}

function clean(v: string | null | undefined): string {
  return (v ?? '').trim()
}

/** "Musterstr. 1" / "12345 Berlin" / "Deutschland" — blanks dropped. */
function addressLines(street?: string | null, postcode?: string | null, city?: string | null, country?: string | null): string[] {
  return [
    clean(street),
    [clean(postcode), clean(city)].filter(Boolean).join(' '),
    clean(country),
  ].filter(Boolean)
}

/**
 * Resolve the address block.
 *
 * - billed to the company → the company is the addressee and the guest is
 *   named below it, so the post still reaches the right desk
 * - billed to the person  → the guest is the addressee, and the company is
 *   still named underneath whenever one is on file
 *
 * The company address is used when the document goes to the company and one
 * was entered; otherwise the guest's own address applies.
 */
export function buildRecipient(src: RecipientSource, billTo: BillTo | null | undefined): Recipient {
  const person  = clean(src.name)
  const company = clean(src.companyName)
  const vat     = clean(src.vatId)

  const personAddress  = addressLines(src.street, src.postcode, src.city, src.country)
  const companyAddress = addressLines(src.companyStreet, src.companyPostcode, src.companyCity, src.companyCountry)

  const toCompany = billTo === 'company' && !!company
  const lines: string[] = []

  if (toCompany) {
    if (person) lines.push(`z. Hd. ${person}`)
    lines.push(...(companyAddress.length > 0 ? companyAddress : personAddress))
  } else {
    // A company on file is named even when the guest is the addressee.
    if (company) lines.push(company)
    lines.push(...(personAddress.length > 0 ? personAddress : companyAddress))
  }

  if (vat && (company || toCompany)) lines.push(`USt-IdNr.: ${vat}`)

  return { name: toCompany ? company : person, lines }
}

/** "Vorname Nachname" — the full name the rest of the app stores. */
export function fullName(first: string | null | undefined, last: string | null | undefined): string {
  return [clean(first), clean(last)].filter(Boolean).join(' ')
}
