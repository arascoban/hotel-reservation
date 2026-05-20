'use client'

/**
 * DateInput — always shows DD / MM / YYYY regardless of browser locale.
 * Accepts/emits value as 'yyyy-MM-dd' string (same as <input type="date">).
 */
import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'

interface Props {
  value: string           // 'yyyy-MM-dd' or ''
  onChange: (v: string) => void
  required?: boolean
  className?: string
  id?: string
  min?: string            // kept for API compat, not visually enforced
}

export default function DateInput({ value, onChange, required, className, id }: Props) {
  const [dd, setDd] = useState('')
  const [mm, setMm] = useState('')
  const [yy, setYy] = useState('')

  const mmRef = useRef<HTMLInputElement>(null)
  const yyRef = useRef<HTMLInputElement>(null)

  // Sync from external value (yyyy-MM-dd → individual fields)
  useEffect(() => {
    if (value?.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setYy(value.slice(0, 4))
      setMm(value.slice(5, 7))
      setDd(value.slice(8, 10))
    }
  }, [value])

  function emit(d: string, m: string, y: string) {
    if (
      d.length === 2 && m.length === 2 && y.length === 4 &&
      parseInt(d) >= 1  && parseInt(d) <= 31 &&
      parseInt(m) >= 1  && parseInt(m) <= 12 &&
      parseInt(y) >= 2000
    ) {
      onChange(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`)
    }
  }

  function handleDd(v: string) {
    const n = v.replace(/\D/g, '').slice(0, 2)
    setDd(n)
    emit(n, mm, yy)
    if (n.length === 2) mmRef.current?.focus()
  }

  function handleMm(v: string) {
    const n = v.replace(/\D/g, '').slice(0, 2)
    setMm(n)
    emit(dd, n, yy)
    if (n.length === 2) yyRef.current?.focus()
  }

  function handleYy(v: string) {
    const n = v.replace(/\D/g, '').slice(0, 4)
    setYy(n)
    emit(dd, mm, n)
  }

  return (
    <div className={cn(
      'flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-2',
      'focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent',
      className,
    )}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="TT"
        value={dd}
        onChange={e => handleDd(e.target.value)}
        required={required}
        maxLength={2}
        className="w-7 text-center text-sm text-slate-900 bg-transparent outline-none placeholder-slate-300"
      />
      <span className="text-slate-300 text-sm select-none mx-0.5">/</span>
      <input
        ref={mmRef}
        type="text"
        inputMode="numeric"
        placeholder="MM"
        value={mm}
        onChange={e => handleMm(e.target.value)}
        maxLength={2}
        className="w-7 text-center text-sm text-slate-900 bg-transparent outline-none placeholder-slate-300"
      />
      <span className="text-slate-300 text-sm select-none mx-0.5">/</span>
      <input
        ref={yyRef}
        type="text"
        inputMode="numeric"
        placeholder="JJJJ"
        value={yy}
        onChange={e => handleYy(e.target.value)}
        maxLength={4}
        className="w-12 text-center text-sm text-slate-900 bg-transparent outline-none placeholder-slate-300"
      />
    </div>
  )
}
