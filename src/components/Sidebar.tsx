'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  CalendarDays,
  LogIn,
  LogOut,
  CreditCard,
  Search,
  Plus,
  ChevronRight,
  X,
  CalendarClock,
  RefreshCw,
  BarChart3,
  Utensils,
  Hotel,
  Lock,
  ShieldCheck,
  User,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'
import { useAdmin } from '@/hooks/useAdmin'

const NAV_BASE = [
  { href: '/search',     label: 'Suche',                  icon: Search },
  { href: '/',           label: 'Kalender',               icon: CalendarDays },
  { href: '/checkins',   label: 'Heutige Ankünfte',       icon: LogIn },
  { href: '/checkouts',  label: 'Heutige Abreisen',       icon: LogOut },
  { href: '/upcoming',   label: 'Bevorstehende Ankünfte', icon: CalendarClock },
  { href: '/unpaid',     label: 'Offene Zahlungen',       icon: CreditCard },
  { href: '/breakfast',  label: 'Frühstücksliste',        icon: Utensils },
  { href: '/rooms',      label: 'Zimmerstatus',           icon: Hotel },
  { href: '/statistics', label: 'Statistiken',            icon: BarChart3 },
]

const NAV_ADMIN_EXTRAS = [
  { href: '/lockers', label: 'Schließfach-PINs',   icon: Lock },
  { href: '/sync',    label: 'iCal Synchronisation', icon: RefreshCw },
]

interface Props {
  isOpen?: boolean
  onClose?: () => void
}

export default function Sidebar({ isOpen = false, onClose }: Props) {
  const pathname    = usePathname()
  const router      = useRouter()
  const supabase    = createClient()
  const { isAdmin } = useAdmin()

  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
  }, [supabase])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const NAV = isAdmin ? [...NAV_BASE, ...NAV_ADMIN_EXTRAS] : NAV_BASE

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-slate-900 text-white',
        'transition-transform duration-200 ease-in-out',
        'lg:translate-x-0',
        'print:hidden',
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}
    >
      {/* ── Logo / Brand ── */}
      <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-slate-700/60">
        <Image
          src="/logo.png"
          alt="Jägerstieg Hotel & Pension"
          width={148}
          height={74}
          className="object-contain flex-shrink-0"
          priority
        />
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden flex-shrink-0 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            aria-label="Menü schließen"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── New Reservation CTA ── */}
      <div className="px-3 pt-4 pb-2">
        <Link
          href="/reservations/new"
          onClick={onClose}
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 px-3 py-2.5 text-sm font-semibold transition-all"
        >
          <Plus className="w-4 h-4" />
          Neue Reservierung
        </Link>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
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
        })}
      </nav>

      {/* ── Account info ── */}
      {userEmail && (
        <div className="px-3 pb-2 border-t border-slate-700/60 pt-3">
          <div className="flex items-start gap-2 rounded-xl bg-slate-800 px-3 py-2.5">
            {isAdmin
              ? <ShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              : <User className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
            }
            <div className="min-w-0">
              <p className="text-xs text-slate-300 truncate leading-tight">{userEmail}</p>
              <p className={cn(
                'text-xs font-semibold mt-0.5 leading-tight',
                isAdmin ? 'text-blue-400' : 'text-slate-500',
              )}>
                {isAdmin ? 'Admin' : 'Mitarbeiter'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Sign out ── */}
      <div className="px-3 pb-4 pt-1">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
        >
          <LogOut className="w-4 h-4" />
          Abmelden
        </button>
      </div>
    </aside>
  )
}
