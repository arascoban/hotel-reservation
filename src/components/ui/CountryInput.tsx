'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/cn'

// ── Country list (German names, DACH first, then alphabetical) ───────────────
const COUNTRIES: string[] = [
  // DACH — most frequent guests for a German hotel
  'Deutschland', 'Österreich', 'Schweiz',
  // Rest of Europe alphabetical
  'Albanien', 'Andorra', 'Belgien', 'Bosnien und Herzegowina', 'Bulgarien',
  'Dänemark', 'Estland', 'Finnland', 'Frankreich', 'Griechenland',
  'Irland', 'Island', 'Italien', 'Kosovo', 'Kroatien',
  'Lettland', 'Liechtenstein', 'Litauen', 'Luxemburg', 'Malta',
  'Moldau', 'Monaco', 'Montenegro', 'Niederlande', 'Nordmazedonien',
  'Norwegen', 'Polen', 'Portugal', 'Rumänien', 'San Marino',
  'Schweden', 'Serbien', 'Slowakei', 'Slowenien', 'Spanien',
  'Tschechien', 'Ukraine', 'Ungarn', 'Vatikanstadt',
  'Vereinigtes Königreich', 'Weißrussland', 'Zypern',
  // Non-European
  'Ägypten', 'Algerien', 'Argentinien', 'Australien', 'Brasilien',
  'China', 'Indien', 'Indonesien', 'Iran', 'Israel',
  'Japan', 'Kanada', 'Kasachstan', 'Kenia', 'Kolumbien',
  'Malaysia', 'Marokko', 'Mexiko', 'Neuseeland', 'Nigeria',
  'Pakistan', 'Peru', 'Philippinen', 'Russland', 'Saudi-Arabien',
  'Singapur', 'Südafrika', 'Südkorea', 'Taiwan', 'Thailand',
  'Tunesien', 'Türkei', 'USA', 'Vereinigte Arabische Emirate', 'Vietnam',
]

interface Props {
  value:      string
  onChange:   (value: string) => void
  className?: string
  placeholder?: string
}

export default function CountryInput({
  value,
  onChange,
  className,
  placeholder = 'z.B. Deutschland',
}: Props) {
  const [query,       setQuery]       = useState(value)
  const [open,        setOpen]        = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync when parent resets the value
  useEffect(() => { setQuery(value) }, [value])

  // Close when clicking outside
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const filtered = useCallback((): string[] => {
    const q = query.trim().toLowerCase()
    if (!q) return COUNTRIES.slice(0, 8)
    // startsWith match first, then includes
    const starts   = COUNTRIES.filter(c => c.toLowerCase().startsWith(q))
    const includes = COUNTRIES.filter(c => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q))
    return [...starts, ...includes].slice(0, 10)
  }, [query])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    onChange(v)
    setOpen(true)
    setActiveIndex(-1)
  }

  function select(country: string) {
    setQuery(country)
    onChange(country)
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const list = filtered()
    if (!open || list.length === 0) {
      if (e.key === 'ArrowDown') { setOpen(true); setActiveIndex(0) }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, list.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      select(list[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const suggestions = filtered()

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />
      {open && suggestions.length > 0 && (
        <ul
          className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
          style={{ maxHeight: '13rem', overflowY: 'auto' }}
        >
          {suggestions.map((country, i) => (
            <li
              key={country}
              onPointerDown={e => { e.preventDefault(); select(country) }}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none',
                i === activeIndex
                  ? 'bg-blue-50 text-blue-900 font-medium'
                  : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              {country}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
