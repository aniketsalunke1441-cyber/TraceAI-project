import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as api from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // keep the same object while the same person is logged in (avoids needless reloads)
    const update = (u) => setUser((prev) => (prev?.id === u?.id && prev?.name === u?.name ? prev : u))
    api
      .getCurrentUser()
      .then(update)
      .catch(() => update(null))
      .finally(() => setLoading(false))
    return api.onAuthChange(update)
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

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, isDemo: api.isDemoMode }}>
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
