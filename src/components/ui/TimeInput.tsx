'use client'

/**
 * TimeInput — always shows HH:MM (24-hour) regardless of browser locale.
 * Accepts/emits value as 'HH:MM' string (same as <input type="time">).
 */
import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

interface Props {
  value: string           // 'HH:MM'
  onChange: (v: string) => void
  className?: string
}

export default function TimeInput({ value, onChange, className }: Props) {
  const [hh, setHh] = useState('')
  const [mm, setMm] = useState('')

  const mmRef = useRef<HTMLInputElement>(null)

  // Sync from external value
  useEffect(() => {
    if (value?.match(/^\d{2}:\d{2}$/)) {
      setHh(value.slice(0, 2))
      setMm(value.slice(3, 5))
    }
  }, [value])

  function emit(h: string, m: string) {
    const hPad = h.padStart(2, '0')
    const mPad = m.padStart(2, '0')
    if (h !== '' && m !== '') onChange(`${hPad}:${mPad}`)
  }

  function handleHh(v: string) {
    const n = v.replace(/\D/g, '').slice(0, 2)
    // Clamp to 0–23
    const clamped = n === '' ? '' : String(Math.min(parseInt(n || '0'), 23)).padStart(n.length > 1 ? 2 : 1, '0')
    setHh(clamped)
    emit(clamped, mm)
    if (clamped.length === 2) mmRef.current?.focus()
  }

  function handleMm(v: string) {
    const n = v.replace(/\D/g, '').slice(0, 2)
    // Clamp to 0–59
    const clamped = n === '' ? '' : String(Math.min(parseInt(n || '0'), 59)).padStart(n.length > 1 ? 2 : 1, '0')
    setMm(clamped)
    emit(hh, clamped)
  }

  // On blur, pad single digits (e.g. "9" → "09")
  function padHh() {
    if (hh && hh.length === 1) { const p = hh.padStart(2, '0'); setHh(p); emit(p, mm) }
  }
  function padMm() {
    if (mm && mm.length === 1) { const p = mm.padStart(2, '0'); setMm(p); emit(hh, p) }
  }

  return (
    <div className={cn(
      'flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-2',
      'focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent',
      className,
    )}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="HH"
        value={hh}
        onChange={e => handleHh(e.target.value)}
        onBlur={padHh}
        maxLength={2}
        className="w-7 text-center text-sm text-slate-900 bg-transparent outline-none placeholder-slate-300"
      />
      <span className="text-slate-300 text-sm select-none mx-0.5">:</span>
      <input
        ref={mmRef}
        type="text"
        inputMode="numeric"
        placeholder="MM"
        value={mm}
        onChange={e => handleMm(e.target.value)}
        onBlur={padMm}
        maxLength={2}
        className="w-7 text-center text-sm text-slate-900 bg-transparent outline-none placeholder-slate-300"
      />
    </div>
  )
}
