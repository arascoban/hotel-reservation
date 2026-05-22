'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/cn'
import { useAdmin } from '@/hooks/useAdmin'

interface MenuItem {
  id: string
  name: string
  description: string | null
  price: number
  category: string
  is_available: boolean
  sort_order: number
}

const CATEGORIES = ['Frühstück', 'Snacks', 'Warme Speisen', 'Getränke', 'Sonstiges']

const EMPTY: Omit<MenuItem, 'id' | 'sort_order'> = {
  name: '', description: '', price: 0, category: 'Sonstiges', is_available: true,
}

export default function MenuPage() {
  const supabase       = createClient()
  const { isAdmin }    = useAdmin()
  const [items, setItems]     = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId]   = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<MenuItem>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [newItem, setNewItem] = useState({ ...EMPTY })
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState('')

  useEffect(() => {
    supabase
      .from('menu_items')
      .select('*')
      .order('sort_order')
      .then(({ data }) => { if (data) setItems(data as MenuItem[]); setLoading(false) })
  }, [supabase])

  async function toggleAvailable(item: MenuItem) {
    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: !item.is_available, updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (!error) setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_available: !i.is_available } : i))
  }

  async function saveEdit(id: string) {
    setSaving(true)
    const { error } = await supabase
      .from('menu_items')
      .update({ ...editData, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...editData } : i))
      setEditId(null)
      flash('✓ Gespeichert')
    }
    setSaving(false)
  }

  async function addItem() {
    if (!newItem.name.trim()) return
    setSaving(true)
    const maxSort = Math.max(0, ...items.map(i => i.sort_order)) + 10
    const { data, error } = await supabase
      .from('menu_items')
      .insert({ ...newItem, sort_order: maxSort })
      .select()
      .single()
    if (!error && data) {
      setItems(prev => [...prev, data as MenuItem])
      setNewItem({ ...EMPTY })
      setShowAdd(false)
      flash('✓ Artikel hinzugefügt')
    }
    setSaving(false)
  }

  async function deleteItem(id: string) {
    if (!confirm('Artikel wirklich löschen?')) return
    await supabase.from('menu_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function flash(text: string) { setMsg(text); setTimeout(() => setMsg(''), 2500) }

  const categories = CATEGORIES.filter(c => items.some(i => i.category === c))

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Speisekarte</h1>
        <div className="flex items-center gap-3">
          {msg && <span className="text-green-600 text-sm font-medium">{msg}</span>}
          {isAdmin && (
            <button
              onClick={() => setShowAdd(true)}
              className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              + Artikel hinzufügen
            </button>
          )}
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto space-y-8">

        {/* ── Add new item form ── */}
        {showAdd && (
          <div className="bg-white rounded-2xl border border-blue-200 p-5 shadow-sm">
            <h2 className="font-bold text-slate-900 mb-4">Neuer Artikel</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Name *</label>
                <input value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Artikelname" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-slate-500 mb-1 block">Beschreibung</label>
                <input value={newItem.description ?? ''} onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Kurze Beschreibung" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Preis (€)</label>
                <input type="number" step="0.50" min="0" value={newItem.price}
                  onChange={e => setNewItem(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 mb-1 block">Kategorie</label>
                <select value={newItem.category} onChange={e => setNewItem(p => ({ ...p, category: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors">
                Abbrechen
              </button>
              <button onClick={addItem} disabled={saving || !newItem.name.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? 'Speichern…' : 'Hinzufügen'}
              </button>
            </div>
          </div>
        )}

        {/* ── Menu items by category ── */}
        {loading ? (
          <p className="text-slate-400 text-sm">Lade Speisekarte…</p>
        ) : (
          categories.map(category => (
            <section key={category}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">{category}</h2>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {items.filter(i => i.category === category).map((item, idx, arr) => (
                  <div key={item.id} className={cn('px-5 py-4', idx < arr.length - 1 && 'border-b border-slate-100')}>
                    {editId === item.id ? (
                      /* ── Inline edit ── */
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <input value={editData.name ?? item.name}
                              onChange={e => setEditData(p => ({ ...p, name: e.target.value }))}
                              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div className="col-span-2">
                            <input value={editData.description ?? item.description ?? ''}
                              onChange={e => setEditData(p => ({ ...p, description: e.target.value }))}
                              placeholder="Beschreibung"
                              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Preis (€)</label>
                            <input type="number" step="0.50" min="0"
                              value={editData.price ?? item.price}
                              onChange={e => setEditData(p => ({ ...p, price: parseFloat(e.target.value) || 0 }))}
                              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          <div>
                            <label className="text-xs text-slate-500 mb-1 block">Kategorie</label>
                            <select value={editData.category ?? item.category}
                              onChange={e => setEditData(p => ({ ...p, category: e.target.value }))}
                              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditId(null)}
                            className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100">Abbrechen</button>
                          <button onClick={() => saveEdit(item.id)} disabled={saving}
                            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                            {saving ? '…' : 'Speichern'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Display row ── */
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className={cn('font-semibold text-sm', !item.is_available && 'line-through text-slate-400')}>
                            {item.name}
                          </p>
                          {item.description && (
                            <p className="text-xs text-slate-400 mt-0.5 truncate">{item.description}</p>
                          )}
                        </div>
                        <span className="font-bold text-slate-800 text-sm flex-shrink-0">
                          €{item.price.toFixed(2)}
                        </span>
                        {/* Available toggle */}
                        <button
                          onClick={() => toggleAvailable(item)}
                          title={item.is_available ? 'Als ausverkauft markieren' : 'Als verfügbar markieren'}
                          className={cn(
                            'flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                            item.is_available
                              ? 'bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700'
                              : 'bg-red-100 text-red-600 hover:bg-green-100 hover:text-green-700',
                          )}
                        >
                          {item.is_available ? 'Verfügbar' : 'Ausverkauft'}
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => { setEditId(item.id); setEditData({}) }}
                              className="flex-shrink-0 text-slate-400 hover:text-slate-700 text-sm px-2 py-1 rounded transition-colors"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => deleteItem(item.id)}
                              className="flex-shrink-0 text-slate-300 hover:text-red-500 text-sm px-2 py-1 rounded transition-colors"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
