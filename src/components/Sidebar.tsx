'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  CalendarDays,
  LogIn,
  LogOut,
  CreditCard,
  Search,
  Plus,
  Hotel,
  ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'

const NAV = [
  { href: '/',          label: 'Kalender',          icon: CalendarDays },
  { href: '/checkins',  label: 'Heutige Ankünfte',  icon: LogIn },
  { href: '/checkouts', label: 'Heutige Abreisen',  icon: LogOut },
  { href: '/unpaid',    label: 'Offene Zahlungen',  icon: CreditCard },
  { href: '/search',    label: 'Suche',             icon: Search },
  // iCal Sync hidden — feature available at /sync when needed
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-56 flex-col bg-slate-900 text-white">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700/60">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500 flex-shrink-0">
          <Hotel className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-sm leading-tight">Hotelrezeption</span>
      </div>

      {/* New Reservation CTA */}
      <div className="px-3 pt-4 pb-2">
        <Link
          href="/reservations/new"
          className="flex items-center justify-center gap-2 w-full rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Neue Reservierung
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white',
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{label}</span>
              {isActive && <ChevronRight className="w-3 h-3 ml-auto flex-shrink-0 text-slate-400" />}
            </Link>
          )
        })}
      </nav>

      {/* Sign out */}
      <div className="px-3 pb-4 border-t border-slate-700/60 pt-4">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Abmelden
        </button>
      </div>
    </aside>
  )
}
