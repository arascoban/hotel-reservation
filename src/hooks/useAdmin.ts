'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isAdminUser } from '@/lib/admin'

export function useAdmin() {
  const [isAdmin, setIsAdmin]   = useState(false)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setIsAdmin(isAdminUser(data.user?.email))
      setLoading(false)
    })
  }, [])

  return { isAdmin, loading }
}
