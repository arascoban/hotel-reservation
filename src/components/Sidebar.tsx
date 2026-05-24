'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import {
  CalendarDays, LogIn, LogOut, CreditCard, Search, Plus,
  ChevronRight, ChevronDown, X, CalendarClock, RefreshCw,
  BarChart3, Utensils, Hotel, Lock, ShieldCheck, User,
  UtensilsCrossed, ClipboardList, QrCode, Soup, TrendingUp, FileDown, History,
  FileText,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'
import { useAdmin } from '@/hooks/useAdmin'

// ── Notification counts hook ─────────────────────────────────────────────────

function useNotificationCounts() {
  const supabase = createClient()
  const [foodCount,    setFoodCount]    = useState(0)
  const [cleanCount,   setCleanCount]   = useState(0)
  const [checkinCount, setCheckinCount] = useState(0)
  const [checkoutCount,setCheckoutCount]= useState(0)

  const load = useCallback(async () => {
    const today    = new Date().toISOString().slice(0, 10)
    const todayEnd = `${today}T23:59:59`
    const todayStart = `${today}T00:00:00`

    const [
      { count: food },
      { count: clean },
      { count: checkins },
      { count: checkouts },
    ] = await Promise.all([
      supabase.from('room_orders').select('*', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.from('cleaning_requests').select('*', { count: 'exact', head: true })
        .eq('status', 'pending').gte('request_date', today),
      // Guests arriving today who haven't checked in yet
      supabase.from('reservations').select('*', { count: 'exact', head: true })
        .eq('status', 'confirmed')
        .gte('checkin_at', todayStart)
        .lte('checkin_at', todayEnd)
        .is('deleted_at', null),
      // Guests departing today who haven't checked out yet
      supabase.from('reservations').select('*', { count: 'exact', head: true })
        .in('status', ['confirmed', 'checked_in'])
        .gte('checkout_at', todayStart)
        .lte('checkout_at', todayEnd)
        .is('deleted_at', null),
    ])
    setFoodCount(food       ?? 0)
    setCleanCount(clean     ?? 0)
    setCheckinCount(checkins  ?? 0)
    setCheckoutCount(checkouts ?? 0)
  }, [supabase])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('sidebar_notification_counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_orders' },       load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleaning_requests' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' },      load)
      .subscribe()
    const t = setInterval(load, 30_000)
    return () => { supabase.removeChannel(channel); clearInterval(t) }
  }, [load, supabase])

  return { foodCount, cleanCount, checkinCount, checkoutCount }
}

// ── Nav types ────────────────────────────────────────────────────────────────

interface NavItem {
  href:    string
  label:   string
  icon:    any
  badge?:  number
}

// ── Nav groups (static, no badges — badges injected dynamically) ─────────────

const NAV_STANDALONE = [
  { href: '/search', label: 'Suche',    icon: Search       },
  { href: '/',       label: 'Kalender', icon: CalendarDays },
]

const GROUP_CHECKINS = {
  label: '📅 Ankünfte & Abreisen',
  hrefs: ['/checkins', '/checkouts', '/upcoming', '/past-guests'],
  items: [
    { href: '/checkins',    label: 'Heutige Ankünfte',      icon: LogIn         },
    { href: '/checkouts',   label: 'Heutige Abreisen',       icon: LogOut        },
    { href: '/upcoming',    label: 'Bevorstehende Ankünfte', icon: CalendarClock },
    { href: '/past-guests', label: 'Vergangene Gäste',       icon: History       },
  ] as NavItem[],
}

const GROUP_FINANCE = {
  label: '📊 Finanzen & Statistiken',
  hrefs: ['/unpaid', '/statistics', '/invoices'],
  items: [
    { href: '/unpaid',    label: 'Offene Zahlungen', icon: CreditCard },
    { href: '/invoices',  label: 'Rechnungen',       icon: FileText   },
    { href: '/statistics', label: 'Statistiken',     icon: TrendingUp },
  ] as NavItem[],
}

const NAV_ADMIN_EXTRAS = [
  { href: '/sync',   label: 'iCal Synchronisation', icon: RefreshCw },
  { href: '/import', label: 'Booking.com Import',   icon: FileDown  },
]

const GROUP_FOOD_ADMIN_ITEMS: NavItem[] = [
  { href: '/menu',    label: 'Speisekarte', icon: ClipboardList },
  { href: '/qrcodes', label: 'QR-Codes',    icon: QrCode        },
]

// ── Helper ───────────────────────────────────────────────────────────────────

interface Props { isOpen?: boolean; onClose?: () => void }

function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="ml-1 min-w-[1.25rem] h-5 flex items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white leading-none flex-shrink-0">
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NavLink({
  href, label, icon: Icon, indent = false, onClick, badge,
}: NavItem & { indent?: boolean; onClick?: () => void }) {
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
      <Badge count={badge ?? 0} />
      {isActive && !(badge && badge > 0) && <ChevronRight className="w-3 h-3 flex-shrink-0 text-slate-400" />}
    </Link>
  )
}

function SubMenu({
  label, hrefs, items, onClose,
}: {
  label: string; hrefs: string[]; items: NavItem[]; onClose?: () => void
}) {
  const pathname = usePathname()
  const isActive = hrefs.some(h => pathname.startsWith(h))
  const [open, setOpen] = useState(isActive)

  useEffect(() => { if (isActive) setOpen(true) }, [isActive])

  const totalBadge = items.reduce((sum, i) => sum + (i.badge ?? 0), 0)

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
        {/* Show total badge on group header when collapsed */}
        {!open && totalBadge > 0 && <Badge count={totalBadge} />}
        {open
          ? <ChevronDown  className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
          : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
        }
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {items.map(i => (
            <NavLink key={i.href} {...i} indent onClick={onClose} />
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
  const { foodCount, cleanCount, checkinCount, checkoutCount } = useNotificationCounts()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null))
  }, [supabase])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Check-in/out group built dynamically with today's pending counts
  const checkinsGroup = {
    label: '📅 Ankünfte & Abreisen',
    hrefs: ['/checkins', '/checkouts', '/upcoming', '/past-guests'],
    items: [
      { href: '/checkins',    label: 'Heutige Ankünfte',       icon: LogIn,         badge: checkinCount  || undefined },
      { href: '/checkouts',   label: 'Heutige Abreisen',        icon: LogOut,        badge: checkoutCount || undefined },
      { href: '/upcoming',    label: 'Bevorstehende Ankünfte',  icon: CalendarClock  },
      { href: '/past-guests', label: 'Vergangene Gäste',        icon: History        },
    ] as NavItem[],
  }

  // Groups built dynamically with live badge counts
  const roomsGroup = {
    label: '🏨 Zimmer & Schlüssel',
    hrefs: ['/rooms', '/lockers'],
    items: [
      { href: '/rooms',   label: 'Zimmerstatus',    icon: Hotel, badge: cleanCount || undefined },
      { href: '/lockers', label: 'Schließfach-PINs', icon: Lock  },
    ] as NavItem[],
  }

  const foodGroup = {
    label: '🍽️ Food & Drinks',
    hrefs: ['/breakfast', '/service-orders', '/menu', '/qrcodes'],
    items: [
      { href: '/breakfast',      label: 'Frühstücksliste', icon: Utensils                              },
      { href: '/service-orders', label: 'Bestellungen',    icon: UtensilsCrossed, badge: foodCount || undefined },
      ...(isAdmin ? GROUP_FOOD_ADMIN_ITEMS : []),
    ] as NavItem[],
  }

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

        {NAV_STANDALONE.map(({ href, label, icon }) => (
          <NavLink key={href} href={href} label={label} icon={icon} onClick={onClose} />
        ))}

        <SubMenu {...checkinsGroup}  onClose={onClose} />
        <SubMenu {...roomsGroup}     onClose={onClose} />
        <SubMenu {...foodGroup}      onClose={onClose} />

        <SubMenu {...GROUP_FINANCE} onClose={onClose} />

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
