/**
 * Anrede (Herr / Frau) → German salutation.
 *
 * Stored as 'Herr' | 'Frau' | NULL on customers, reservations and invoices —
 * one column name everywhere so any surface can read it without mapping.
 */

export const SALUTATIONS = ['Herr', 'Frau'] as const
export type Salutation = (typeof SALUTATIONS)[number]

/** "Max Mustermann" → "Mustermann" — the part a formal greeting uses. */
export function surnameOf(fullName: string | null | undefined): string {
  const name = (fullName ?? '').trim()
  return name.split(/\s+/).slice(-1)[0] || name
}

/**
 * Formal greeting, without the trailing comma.
 * With no Anrede picked it stays neutral rather than guessing.
 */
export function greeting(salutation: string | null | undefined, fullName: string): string {
  if (salutation === 'Herr') return `Sehr geehrter Herr ${surnameOf(fullName)}`
  if (salutation === 'Frau') return `Sehr geehrte Frau ${surnameOf(fullName)}`
  return `Sehr geehrte/r Frau/Herr ${surnameOf(fullName)}`
}

/**
 * Same, but falls back to the warmer opener of the booking confirmation when
 * no Anrede is on file — "Sehr geehrte/r Frau/Herr X" reads like a form letter.
 */
export function greetingOrFriendly(salutation: string | null | undefined, fullName: string): string {
  if (salutation === 'Herr' || salutation === 'Frau') return greeting(salutation, fullName)
  return `Liebe/r ${(fullName ?? '').trim()}`
}
