'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  RefreshCw, Copy, Check, Plus, Trash2,
  ExternalLink, AlertCircle, CheckCircle2, Clock,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ReservationSource } from '@/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Room {
  id: string
  name: string
  room_number: string
  room_types: { name: string }
}

interface SyncFeed {
  id: string
  room_id: string
  platform: ReservationSource
  feed_type: 'import' | 'export'
  url: string | null
  is_active: boolean
  last_synced_at: string | null
}

interface SyncLog {
  id: string
  sync_feed_id: string
  started_at: string
  status: 'success' | 'error' | 'partial'
  events_imported: number
  events_updated: number
  events_skipped: number
  error_message: string | null
}

const PLATFORMS: { value: ReservationSource; label: string }[] = [
  { value: 'booking_com', label: 'Booking.com' },
  { value: 'expedia',     label: 'Expedia' },
  { value: 'airbnb',      label: 'Airbnb' },
  { value: 'other',       label: 'Other' },
]

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SyncPage() {
  const supabase = createClient()

  const [rooms,   setRooms]   = useState<Room[]>([])
  const [feeds,   setFeeds]   = useState<SyncFeed[]>([])
  const [logs,    setLogs]    = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null) // feedId being synced
  const [syncAll, setSyncAll] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const load = useCallback(async () => {
    setLoading(true)
    const [roomsRes, feedsRes, logsRes] = await Promise.all([
      supabase.from('rooms').select('id, name, room_number, room_types(name)')
        .eq('is_active', true).order('sort_order'),
      supabase.from('sync_feeds').select('*').order('created_at'),
      supabase.from('sync_logs').select('*')
        .order('started_at', { ascending: false }).limit(50),
    ])
    setRooms((roomsRes.data ?? []) as Room[])
    setFeeds((feedsRes.data ?? []) as SyncFeed[])
    setLogs((logsRes.data  ?? []) as SyncLog[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // ── Create feed ───────────────────────────────────────────────────────────

  async function createFeed(
    roomId: string,
    feedType: 'import' | 'export',
    platform: ReservationSource,
    url?: string,
  ) {
    await supabase.from('sync_feeds').insert({
      room_id:   roomId,
      feed_type: feedType,
      platform,
      url:       url ?? null,
      is_active: true,
    })
    await load()
  }

  // ── Delete feed ───────────────────────────────────────────────────────────

  async function deleteFeed(id: string) {
    await supabase.from('sync_feeds').delete().eq('id', id)
    await load()
  }

  // ── Trigger sync ──────────────────────────────────────────────────────────

  async function triggerSync(feedId?: string) {
    if (feedId) setSyncing(feedId)
    else        setSyncAll(true)

    await fetch('/api/ical/sync', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(feedId ? { feedId } : {}),
    })

    setSyncing(null)
    setSyncAll(false)
    await load()
  }

  // ── Group feeds by room ───────────────────────────────────────────────────

  const feedsByRoom = feeds.reduce<Record<string, SyncFeed[]>>((acc, f) => {
    if (!acc[f.room_id]) acc[f.room_id] = []
    acc[f.room_id].push(f)
    return acc
  }, {})

  const logsByFeed = logs.reduce<Record<string, SyncLog[]>>((acc, l) => {
    if (!acc[l.sync_feed_id]) acc[l.sync_feed_id] = []
    acc[l.sync_feed_id].push(l)
    return acc
  }, {})

  const importFeeds = feeds.filter(f => f.feed_type === 'import')

  if (loading) {
    return (
      <div className="px-6 py-8 text-slate-400">Sync-Einstellungen werden geladen…</div>
    )
  }

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">iCal Synchronisation</h1>
          <p className="text-slate-500 mt-1">
            Zimmer mit Booking.com, Expedia und Airbnb verbinden.
          </p>
        </div>
        {importFeeds.length > 0 && (
          <button
            onClick={() => triggerSync()}
            disabled={syncAll}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', syncAll && 'animate-spin')} />
            {syncAll ? 'Synchronisierung läuft…' : 'Alle jetzt synchronisieren'}
          </button>
        )}
      </div>

      {/* How it works */}
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 mb-8 space-y-1">
        <p className="text-sm font-semibold text-blue-900">So funktioniert es</p>
        <p className="text-sm text-blue-800">
          <strong>Export-URL →</strong> Kopieren und in Booking.com / Expedia / Airbnb als „Externen Kalender" einfügen.
          Die Plattform ruft ihn regelmäßig ab und blockiert bereits gebuchte Daten.
        </p>
        <p className="text-sm text-blue-800">
          <strong>Import-URL →</strong> Diese URL von Booking.com / Expedia / Airbnb kopieren („Kalender exportieren" / „iCal-Link")
          und hier einfügen. Auf <em>Jetzt synchronisieren</em> klicken um Buchungen zu importieren.
        </p>
      </div>

      {/* Room list */}
      <div className="space-y-4">
        {rooms.map(room => {
          const roomFeeds   = feedsByRoom[room.id] ?? []
          const exportFeed  = roomFeeds.find(f => f.feed_type === 'export')
          const importRoomFeeds = roomFeeds.filter(f => f.feed_type === 'import')
          const exportUrl   = exportFeed
            ? `${origin}/api/ical/export/${exportFeed.id}`
            : null

          return (
            <div key={room.id}
              className="rounded-xl border border-slate-200 bg-white overflow-hidden">

              {/* Room header */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div>
                  <span className="font-semibold text-slate-900">{room.name}</span>
                  <span className="ml-2 text-xs text-slate-400">#{room.room_number}</span>
                  <span className="ml-2 text-xs text-slate-500">{room.room_types.name}</span>
                </div>
              </div>

              <div className="p-4 space-y-5">

                {/* Export section */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Export-URL  <span className="font-normal normal-case text-slate-400">(in Booking.com / Expedia / Airbnb einfügen)</span>
                  </p>
                  {exportFeed ? (
                    <ExportUrlRow url={exportUrl!} />
                  ) : (
                    <button
                      onClick={() => createFeed(room.id, 'export', 'other')}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Export-URL generieren
                    </button>
                  )}
                </div>

                {/* Import section */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Import-URLs <span className="font-normal normal-case text-slate-400">(von Booking.com / Expedia / Airbnb kopieren)</span>
                  </p>

                  {importRoomFeeds.map(feed => {
                    const feedLogs = logsByFeed[feed.id] ?? []
                    const lastLog  = feedLogs[0]
                    return (
                      <ImportFeedRow
                        key={feed.id}
                        feed={feed}
                        lastLog={lastLog}
                        syncing={syncing === feed.id}
                        onSync={() => triggerSync(feed.id)}
                        onDelete={() => deleteFeed(feed.id)}
                        onUrlChange={async (url) => {
                          await supabase.from('sync_feeds')
                            .update({ url })
                            .eq('id', feed.id)
                          await load()
                        }}
                      />
                    )
                  })}

                  <AddImportFeedRow
                    onAdd={(platform, url) => createFeed(room.id, 'import', platform, url)}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Export URL row ───────────────────────────────────────────────────────────

function ExportUrlRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
      <code className="flex-1 text-xs text-slate-600 truncate">{url}</code>
      <button onClick={copy}
        className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 flex-shrink-0">
        {copied
          ? <><Check className="w-3.5 h-3.5 text-green-600" /><span className="text-green-600">Copied</span></>
          : <><Copy className="w-3.5 h-3.5" />Copy</>}
      </button>
      <a href={url} target="_blank" rel="noreferrer"
        className="text-slate-400 hover:text-slate-600">
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  )
}

// ─── Import feed row ──────────────────────────────────────────────────────────

function ImportFeedRow({
  feed, lastLog, syncing, onSync, onDelete, onUrlChange,
}: {
  feed: SyncFeed
  lastLog?: SyncLog
  syncing: boolean
  onSync: () => void
  onDelete: () => void
  onUrlChange: (url: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [urlValue, setUrlValue] = useState(feed.url ?? '')
  const platformLabel = PLATFORMS.find(p => p.value === feed.platform)?.label ?? feed.platform

  return (
    <div className="rounded-lg border border-slate-200 p-3 mb-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">{platformLabel}</span>
        <div className="flex items-center gap-2">
          {lastLog && (
            <span className={cn('flex items-center gap-1 text-xs',
              lastLog.status === 'success' ? 'text-green-600' : 'text-red-600')}>
              {lastLog.status === 'success'
                ? <CheckCircle2 className="w-3 h-3" />
                : <AlertCircle className="w-3 h-3" />}
              {lastLog.status === 'success'
                ? `+${lastLog.events_imported} new, ${lastLog.events_updated} updated`
                : lastLog.error_message?.slice(0, 40)}
            </span>
          )}
          {feed.last_synced_at && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              {new Date(feed.last_synced_at).toLocaleString('en-GB', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          )}
          <button onClick={onSync} disabled={syncing || !feed.url}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-40">
            <RefreshCw className={cn('w-3 h-3', syncing && 'animate-spin')} />
            {syncing ? 'Läuft…' : 'Sync'}
          </button>
          <button onClick={onDelete}
            className="text-slate-400 hover:text-red-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="flex gap-2">
          <input type="url" value={urlValue}
            onChange={e => setUrlValue(e.target.value)}
            placeholder="https://ical.booking.com/…"
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button onClick={() => { onUrlChange(urlValue); setEditing(false) }}
            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700">
            Save
          </button>
          <button onClick={() => setEditing(false)}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs text-slate-500 truncate">
            {feed.url ?? <span className="text-red-400 italic">No URL set — click Edit</span>}
          </code>
          <button onClick={() => setEditing(true)}
            className="text-xs text-slate-500 hover:text-slate-800 font-medium">
            Edit
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Add import feed row ──────────────────────────────────────────────────────

function AddImportFeedRow({
  onAdd,
}: {
  onAdd: (platform: ReservationSource, url: string) => void
}) {
  const [open,     setOpen]     = useState(false)
  const [platform, setPlatform] = useState<ReservationSource>('booking_com')
  const [url,      setUrl]      = useState('')

  function handleAdd() {
    if (!url.trim()) return
    onAdd(platform, url.trim())
    setUrl('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium mt-1">
        <Plus className="w-3.5 h-3.5" />
        Import-Feed hinzufügen
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 mt-1 space-y-2">
      <p className="text-xs font-semibold text-blue-800">Import-Feed hinzufügen</p>
      <div className="flex gap-2">
        <select value={platform} onChange={e => setPlatform(e.target.value as ReservationSource)}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
          {PLATFORMS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <input type="url" value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://ical.booking.com/v1/…"
          className="flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={handleAdd} disabled={!url.trim()}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          Add
        </button>
        <button onClick={() => setOpen(false)}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white">
          Cancel
        </button>
      </div>
    </div>
  )
}
