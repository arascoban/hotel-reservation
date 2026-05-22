'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function GlobalOrderNotifier() {
  const supabase = createClient()
  const [toast, setToast] = useState<{ roomNumber: string } | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Unlock AudioContext on ANY click in the document — no special button needed
  useEffect(() => {
    function unlock() {
      if (typeof window === 'undefined') return
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume()
      }
    }
    document.addEventListener('click', unlock)
    return () => document.removeEventListener('click', unlock)
  }, [])

  function playBeep() {
    const ctx = audioCtxRef.current
    if (!ctx || ctx.state !== 'running') return
    try {
      ;[0, 0.28].forEach((delay, i) => {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.type            = 'sine'
        osc.frequency.value = i === 0 ? 880 : 1100
        gain.gain.setValueAtTime(0.5, ctx.currentTime + delay)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.4)
        osc.start(ctx.currentTime + delay)
        osc.stop(ctx.currentTime + delay + 0.4)
      })
    } catch (_) {}
  }

  useEffect(() => {
    const channel = supabase
      .channel('global_order_notifier')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_orders' },
        (payload) => {
          const order = payload.new as { room_number: string }
          setToast({ roomNumber: order.room_number })
          playBeep()
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  // Auto-dismiss after 8 s
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 8000)
    return () => clearTimeout(t)
  }, [toast])

  if (!toast) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] print:hidden animate-bounce">
      <div className="flex items-center gap-3 bg-blue-600 text-white rounded-2xl shadow-2xl px-6 py-4 min-w-[260px]">
        <span className="text-2xl">🔔</span>
        <div className="flex-1">
          <p className="font-black text-lg leading-tight">Neue Bestellung!</p>
          <p className="text-blue-200 text-sm">Zimmer {toast.roomNumber}</p>
        </div>
        <button
          onClick={() => setToast(null)}
          className="text-blue-300 hover:text-white text-xl leading-none ml-1"
        >
          ×
        </button>
      </div>
    </div>
  )
}
