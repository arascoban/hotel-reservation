'use client'

import { useRouter } from 'next/navigation'
import { Printer } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Props {
  isWeekView: boolean
}

export default function CheckinsControls({ isWeekView }: Props) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm shadow-sm">
        <button
          onClick={() => router.push('/checkins')}
          className={cn(
            'px-3 py-1.5 font-medium transition-colors',
            !isWeekView
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          Heute
        </button>
        <button
          onClick={() => router.push('/checkins?view=week')}
          className={cn(
            'px-3 py-1.5 font-medium transition-colors border-l border-slate-200',
            isWeekView
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          7 Tage
        </button>
      </div>

      <button
        onClick={() => window.print()}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors shadow-sm"
      >
        <Printer className="w-4 h-4" />
        Drucken
      </button>
    </div>
  )
}
