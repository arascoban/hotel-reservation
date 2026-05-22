import { createClient } from '@/lib/supabase/server'
import { format, addDays } from 'date-fns'
import { de } from 'date-fns/locale'
import { Utensils } from 'lucide-react'
import type { ReservationWithRoom } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function BreakfastPage() {
  const supabase = await createClient()
  const now   = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const day2  = format(addDays(now, 1), 'yyyy-MM-dd')
  const day3  = format(addDays(now, 2), 'yyyy-MM-dd')

  // Fetch all breakfast guests for the next 3 days in one query
  const { data, error } = await supabase
    .from('reservations')
    .select('*, rooms(*, room_types(*))')
    .eq('breakfast_included', true)
    .not('status', 'in', '("cancelled","no_show","checked_out")')
    .is('deleted_at', null)
    .lte('checkin_at',  `${day3}T23:59:59`)
    .gte('checkout_at', `${today}T00:00:00`)
    .order('rooms(room_number)', { ascending: true })

  const all = (data ?? []) as ReservationWithRoom[]

  // Split into per-day buckets: guest is having breakfast if checkin <= day < checkout
  function guestsForDay(dateStr: string) {
    return all.filter(r => r.checkin_at <= `${dateStr}T23:59:59` && r.checkout_at > `${dateStr}T00:00:00`)
  }

  const days = [
    { label: 'Heute',       date: now,              dateStr: today, guests: guestsForDay(today) },
    { label: 'Morgen',      date: addDays(now, 1),  dateStr: day2,  guests: guestsForDay(day2)  },
    { label: 'Übermorgen',  date: addDays(now, 2),  dateStr: day3,  guests: guestsForDay(day3)  },
  ]

  return (
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Utensils className="w-6 h-6 text-amber-500" />
            Frühstücksliste
          </h1>
          <p className="text-slate-500 mt-1">3-Tages-Vorschau</p>
        </div>
        <button
          className="print:hidden rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          id="printBtn"
        >
          🖨️ Drucken
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 mb-4 text-sm">
          Fehler beim Laden der Frühstücksliste.
        </div>
      )}

      <div className="space-y-8">
        {days.map(({ label, date, guests }) => {
          const totalGuests = guests.reduce((s, r) => s + r.guest_count, 0)
          const isToday     = label === 'Heute'

          return (
            <div key={label}>
              {/* Day header */}
              <div className={`flex items-center justify-between mb-3 pb-2 border-b-2 ${isToday ? 'border-amber-400' : 'border-slate-200'}`}>
                <div>
                  <h2 className={`text-lg font-bold ${isToday ? 'text-amber-700' : 'text-slate-700'}`}>
                    {label}
                    <span className="ml-2 text-sm font-normal text-slate-400">
                      {format(date, 'EEEE, d. MMMM yyyy', { locale: de })}
                    </span>
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${isToday ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                    {guests.length} Zimmer · {totalGuests} Pers.
                  </div>
                </div>
              </div>

              {guests.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
                  <p className="text-slate-400 text-sm">Kein Frühstück gebucht.</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Zimmer</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Gast</th>
                        <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Pers.</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Abreise</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Status</th>
                        <th className="px-4 py-2.5 print:hidden" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {guests.map(r => (
                        <tr key={r.id} className="hover:bg-amber-50/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className="font-bold text-slate-900">Zi. {r.rooms.room_number}</span>
                            <span className="ml-2 text-xs text-slate-400">{r.rooms.name}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-slate-900">{r.guest_name}</div>
                            {r.guest_phone && <div className="text-xs text-slate-400">{r.guest_phone}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-800 font-bold text-sm">
                              {r.guest_count}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 text-sm">
                            {format(new Date(r.checkout_at), 'd. MMM', { locale: de })}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              r.status === 'checked_in' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {r.status === 'checked_in' ? 'Eingecheckt' : 'Erwartet'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 print:hidden">
                            <span className="text-lg">☕</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td className="px-4 py-2.5 font-semibold text-slate-700" colSpan={2}>Gesamt</td>
                        <td className="px-4 py-2.5 text-center font-bold text-slate-900">{totalGuests}</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        document.getElementById('printBtn')?.addEventListener('click', () => window.print())
      `}} />
    </div>
  )
}
