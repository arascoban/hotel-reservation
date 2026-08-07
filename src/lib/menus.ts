/**
 * Menu keys used by the sidebar and by the visibility switches.
 * Keys must match the rows seeded in migration 033_menu_visibility.sql.
 */

export const MENU_KEYS = [
  'search', 'calendar', 'reservations', 'customers', 'arrivals', 'rooms', 'food', 'finance',
] as const

export type MenuKey = typeof MENU_KEYS[number]

export const MENU_LABELS: Record<MenuKey, string> = {
  search:    'Suche',
  calendar:     'Kalender',
  reservations: 'Reservierungen',
  customers: 'Kunden',
  arrivals:  'Ankünfte & Abreisen',
  rooms:     'Zimmer & Schlüssel',
  food:      'Food & Drinks',
  finance:   'Finanzen & Statistiken',
}

/** Routes covered by each menu — used to guard the pages themselves. */
export const MENU_ROUTES: Record<MenuKey, string[]> = {
  search:    ['/search'],
  calendar:     ['/'],
  reservations: ['/reservations'],
  customers: ['/customers'],
  arrivals:  ['/checkins', '/checkouts', '/upcoming', '/past-guests'],
  rooms:     ['/rooms', '/lockers'],
  food:      ['/breakfast', '/service-orders', '/menu', '/qrcodes'],
  finance:   ['/unpaid', '/invoices', '/statistics'],
}

export type MenuVisibility = Record<string, boolean>

/** Everything visible — the default until the table has been read. */
export const ALL_VISIBLE: MenuVisibility =
  Object.fromEntries(MENU_KEYS.map(k => [k, true]))
