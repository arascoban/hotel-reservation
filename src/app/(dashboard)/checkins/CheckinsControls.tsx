'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Printer } from 'lucide-react'
import { cn } from '@/lib/cn'

type View = 'today' | 'week' | 'month'

interface Props {
  view: View
}

export default function CheckinsControls({ view }: Props) {
  const router = useRouter()

  // If the URL contains ?print=1 (set by the print button on the previous
  // navigation), trigger the browser print dialog once the page has fully
  // rendered with fresh server data, then clean up the param.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.location.search.includes('print=1')) return

    const timer = setTimeout(() => {
      window.print()
      const url = new URL(window.location.href)
      url.searchParams.delete('print')
      window.history.replaceState({}, '', url.toString())
    }, 400)

    return () => clearTimeout(timer)
  }, [])

  // Hard-navigate with ?print=1 so the server re-fetches the latest data
  // (including any just-edited internal notes) before printing.
  function handlePrint() {
    const url = new URL(window.location.href)
    url.searchParams.set('print', '1')
    window.location.href = url.toString()
  }

  const base: Record<View, string> = {
    today: '/checkins',
    week:  '/checkins?view=week',
    month: '/checkins?view=month',
  }

  const btn = (v: View, label: string, first?: boolean) => (
    <button
      onClick={() => router.push(base[v])}
      className={cn(
        'px-3 py-1.5 font-medium transition-colors',
        !first && 'border-l border-slate-200',
        view === v
          ? 'bg-blue-600 text-white'
          : 'bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {label}
    </button>
  )

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm shadow-sm">
        {btn('today', 'Heute', true)}
        {btn('week',  '7 Tage')}
        {btn('month', 'Dieser Monat')}
      </div>

      <button
        onClick={handlePrint}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors shadow-sm"
      >
        <Printer className="w-4 h-4" />
        Drucken
      </button>
    </div>
  )
}
