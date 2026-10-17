import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as api from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    let initialCheckDone = false

    const update = (u, forceLoadingDone = false) => {
      if (!mounted) return
      setUser((prev) => {
        if (!prev && !u) return null
        if (prev?.id === u?.id && prev?.name === u?.name && prev?.email === u?.email) {
          return prev
        }
        return u
      })
      if (forceLoadingDone || initialCheckDone) {
        setLoading(false)
      }
    }

    // Subscribe to auth changes (token refresh, sign-in, sign-out)
    const unsubscribe = api.onAuthChange((u, event) => {
      if (!mounted) return
      if (event === 'INITIAL_SESSION') {
        initialCheckDone = true
      }
      update(u, event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT')
    })

    // Also verify session explicitly across all backends
    api
      .getCurrentUser()
      .then((u) => {
        if (!mounted) return
        initialCheckDone = true
        update(u, true)
      })
      .catch((err) => {
        console.warn('Initial session check notice:', err?.message)
        if (mounted) {
          initialCheckDone = true
          setLoading(false)
        }
      })

    return () => {
      mounted = false
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (credentials) => {
    const u = await api.signIn(credentials)
    setUser(u)
    return u
  }, [])

  const signUp = useCallback(async (details) => {
    const result = await api.signUp(details)
    if (result.user) setUser(result.user)
    return result
  }, [])

  const signOut = useCallback(async () => {
    await api.signOut()
    setUser(null)
  }, [])

  const updateProfile = useCallback(async ({ name }) => {
    const updated = await api.updateUserProfile({ name })
    setUser(updated)
    return updated
  }, [])

  const refreshUser = useCallback(async () => {
    const u = await api.getCurrentUser().catch(() => null)
    setUser(u)
    return u
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signOut,
        updateProfile,
        refreshUser,
        isDemo: api.isDemoMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
