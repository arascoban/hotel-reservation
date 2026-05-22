'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  CalendarDays, LogIn, LogOut, CreditCard, Search, Plus,
  ChevronRight, ChevronDown, X, CalendarClock, RefreshCw,
  BarChart3, Utensils, Hotel, Lock, ShieldCheck, User,
  UtensilsCrossed, ClipboardList, QrCode, Soup, TrendingUp, FileDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'
import { useAdmin } from '@/hooks/useAdmin'

// ── Nav groups ──────────────────────────────────────────────────────────────

const NAV_STANDALONE = [
  { href: '/search', label: 'Suche',    icon: Search       },
  { href: '/',       label: 'Kalender', icon: CalendarDays },
]

const GROUP_ROOMS_BASE = {
  label: '🏨 Zimmer & Schlüssel',
  hrefs: ['/rooms', '/lockers'],
  items: [
    { href: '/rooms',   label: 'Zimmerstatus',    icon: Hotel },
    { href: '/lockers', label: 'Schließfach-PINs', icon: Lock  },
  ],
}

const GROUP_CHECKINS = {
  label: '📅 Ankünfte & Abreisen',
  hrefs: ['/checkins', '/checkouts', '/upcoming'],
  items: [
    { href: '/checkins',  label: 'Heutige Ankünfte',       icon: LogIn        },
    { href: '/checkouts', label: 'Heutige Abreisen',        icon: LogOut       },
    { href: '/upcoming',  label: 'Bevorstehende Ankünfte',  icon: CalendarClock},
  ],
}

const GROUP_FINANCE = {
  label: '📊 Finanzen & Statistiken',
  hrefs: ['/unpaid', '/statistics'],
  items: [
    { href: '/unpaid',     label: 'Offene Zahlungen', icon: CreditCard },
    { href: '/statistics', label: 'Statistiken',      icon: TrendingUp },
  ],
}

const GROUP_FOOD_BASE = {
  label: '🍽️ Food & Drinks',
  hrefs: ['/breakfast', '/service-orders', '/menu', '/qrcodes'],
  items: [
    { href: '/breakfast',      label: 'Frühstücksliste', icon: Utensils        },
    { href: '/service-orders', label: 'Bestellungen',    icon: UtensilsCrossed },
  ],
}

const GROUP_FOOD_ADMIN_ITEMS = [
  { href: '/menu',    label: 'Speisekarte', icon: ClipboardList },
  { href: '/qrcodes', label: 'QR-Codes',    icon: QrCode        },
]

const NAV_ADMIN_EXTRAS = [
  { href: '/sync',   label: 'iCal Synchronisation', icon: RefreshCw },
  { href: '/import', label: 'Booking.com Import',   icon: FileDown  },
]

// ── Helper ───────────────────────────────────────────────────────────────────

interface Props { isOpen?: boolean; onClose?: () => void }

function NavLink({
  href, label, icon: Icon, indent = false, onClick,
}: {
  href: string; label: string; icon: any; indent?: boolean; onClick?: () => void
}) {
  const pathname = usePathname()
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
        indent && 'pl-7',
        isActive
          ? 'bg-slate-700 text-white shadow-sm'
          : 'text-slate-400 hover:bg-slate-800 hover:text-white',
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">{label}</span>
      {isActive && <ChevronRight className="w-3 h-3 flex-shrink-0 text-slate-400" />}
    </Link>
  )
}

function SubMenu({
  label, hrefs, items, onClose,
}: {
  label: string; hrefs: string[]; items: { href: string; label: string; icon: any }[]; onClose?: () => void
}) {
  const pathname   = usePathname()
  const isActive   = hrefs.some(h => pathname.startsWith(h))
  const [open, setOpen] = useState(isActive)

  useEffect(() => { if (isActive) setOpen(true) }, [isActive])

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
          isActive
            ? 'bg-slate-700/60 text-white'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white',
        )}
      >
        <span className="flex-1 text-left truncate">{label}</span>
        {open
          ? <ChevronDown  className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
          : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
        }
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {items.map(i => (
            <NavLink key={i.href} href={i.href} label={i.label} icon={i.icon} indent onClick={onClose} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar({ isOpen = false, onClose }: Props) {
  const router      = useRouter()
  const supabase    = createClient()
  const { isAdmin } = useAdmin()
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null))
  }, [supabase])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const foodGroup = {
    ...GROUP_FOOD_BASE,
    items: isAdmin
      ? [...GROUP_FOOD_BASE.items, ...GROUP_FOOD_ADMIN_ITEMS]
      : GROUP_FOOD_BASE.items,
  }

  // Locker PINs always visible (read-only for Mitarbeiter, editable for Admin)
  const roomsGroup = GROUP_ROOMS_BASE

  return (
    <aside className={cn(
      'fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-slate-900 text-white',
      'transition-transform duration-200 ease-in-out lg:translate-x-0 print:hidden',
      isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
    )}>

      {/* Logo */}
      <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-slate-700/60">
        <Image src="/logo.png" alt="Jägerstieg Hotel & Pension" width={148} height={74}
          className="object-contain flex-shrink-0" priority />
        {onClose && (
          <button onClick={onClose}
            className="lg:hidden flex-shrink-0 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            aria-label="Menü schließen">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* New reservation */}
      <div className="px-3 pt-4 pb-2">
        <Link href="/reservations/new" onClick={onClose}
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 px-3 py-2.5 text-sm font-semibold transition-all">
          <Plus className="w-4 h-4" />
          Neue Reservierung
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">

        {/* Standalone top items */}
        {NAV_STANDALONE.map(({ href, label, icon }) => (
          <NavLink key={href} href={href} label={label} icon={icon} onClick={onClose} />
        ))}

        {/* Ankünfte & Abreisen */}
        <SubMenu {...GROUP_CHECKINS} onClose={onClose} />

        {/* Zimmer & Schlüssel */}
        <SubMenu {...roomsGroup} onClose={onClose} />

        {/* Food & Drinks */}
        <SubMenu {...foodGroup} onClose={onClose} />

        {/* Finanzen & Statistiken — Admin only */}
        {isAdmin && <SubMenu {...GROUP_FINANCE} onClose={onClose} />}

        {/* Admin-only extras */}
        {isAdmin && NAV_ADMIN_EXTRAS.map(({ href, label, icon }) => (
          <NavLink key={href} href={href} label={label} icon={icon} onClick={onClose} />
        ))}

      </nav>

      {/* Account info */}
      {userEmail && (
        <div className="px-3 pb-2 border-t border-slate-700/60 pt-3">
          <div className="flex items-start gap-2 rounded-xl bg-slate-800 px-3 py-2.5">
            {isAdmin
              ? <ShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              : <User        className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
            }
            <div className="min-w-0">
              <p className="text-xs text-slate-300 truncate leading-tight">{userEmail}</p>
              <p className={cn('text-xs font-semibold mt-0.5 leading-tight',
                isAdmin ? 'text-blue-400' : 'text-slate-500')}>
                {isAdmin ? 'Admin' : 'Mitarbeiter'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sign out */}
      <div className="px-3 pb-4 pt-1">
        <button onClick={handleSignOut}
          className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-all">
          <LogOut className="w-4 h-4" />
          Abmelden
        </button>
      </div>
    </aside>
  )
}
