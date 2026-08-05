'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isAdminUser } from '@/lib/admin'
import { ALL_VISIBLE, type MenuVisibility } from '@/lib/menus'

/**
 * Reads the per-menu visibility switches.
 *
 * The admin account always sees every menu, so it never needs the table.
 * For staff, menus default to visible until the switches load — that avoids
 * a flash of a half-empty sidebar on every page load.
 */
export function useMenuVisibility() {
  const [visibility, setVisibility] = useState<MenuVisibility>(ALL_VISIBLE)
  const [isAdmin,    setIsAdmin]    = useState(false)
  const [loading,    setLoading]    = useState(true)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: userData } = await supabase.auth.getUser()
    const admin = isAdminUser(userData.user?.email)
    setIsAdmin(admin)

    if (admin) {
      setVisibility(ALL_VISIBLE)
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('menu_visibility')
      .select('menu_key, visible_for_staff')

    if (data) {
      const next: MenuVisibility = { ...ALL_VISIBLE }
      for (const row of data as { menu_key: string; visible_for_staff: boolean }[]) {
        next[row.menu_key] = row.visible_for_staff
      }
      setVisibility(next)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  /** Admin sees everything; staff only what is switched on. */
  const canSee = useCallback(
    (key: string) => isAdmin || visibility[key] !== false,
    [isAdmin, visibility],
  )

  return { visibility, canSee, isAdmin, loading, reload: load }
}
