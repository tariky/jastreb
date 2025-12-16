import { create } from 'zustand'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface User {
  id: number
  email: string
  name?: string | null
  isAdmin?: boolean
}

interface AuthState {
  user: User | null
  isLoading: boolean
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
}))

// Fetch current user
export function useCurrentUser() {
  const { setUser, setLoading } = useAuthStore()

  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
      })
      const data = await response.json()
      setUser(data.user)
      setLoading(false)
      return data.user as User | null
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  })
}

// Login mutation
export function useLogin() {
  const queryClient = useQueryClient()
  const { setUser } = useAuthStore()

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(credentials),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Login failed')
      }

      return data.user as User
    },
    onSuccess: (user) => {
      setUser(user)
      queryClient.setQueryData(['auth', 'me'], user)
    },
  })
}

// Register mutation
export function useRegister() {
  const queryClient = useQueryClient()
  const { setUser } = useAuthStore()

  return useMutation({
    mutationFn: async (data: { email: string; password: string; name?: string }) => {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Registration failed')
      }

      return result.user as User
    },
    onSuccess: (user) => {
      setUser(user)
      queryClient.setQueryData(['auth', 'me'], user)
    },
  })
}

// Logout mutation
export function useLogout() {
  const queryClient = useQueryClient()
  const { setUser } = useAuthStore()

  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Logout failed')
      }
    },
    onSuccess: () => {
      setUser(null)
      queryClient.setQueryData(['auth', 'me'], null)
      queryClient.clear()
    },
  })
}

// Hook to check if user is authenticated
export function useAuth() {
  const { data: user, isLoading } = useCurrentUser()
  const login = useLogin()
  const register = useRegister()
  const logout = useLogout()

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login: login.mutateAsync,
    register: register.mutateAsync,
    logout: logout.mutateAsync,
    loginPending: login.isPending,
    registerPending: register.isPending,
    logoutPending: logout.isPending,
    loginError: login.error,
    registerError: register.error,
  }
}

