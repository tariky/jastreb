import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Save,
  Eye,
  EyeOff,
  Key,
  CheckCircle2,
  AlertCircle,
  Info,
  Users,
  Plus,
  Trash2,
  Shield,
  UserPlus,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

export const Route = createFileRoute('/settings/')({
  component: SettingsPage,
})

interface User {
  id: number
  email: string
  name: string | null
  isAdmin: boolean
  createdAt: Date
}

function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [showCreateUserDialog, setShowCreateUserDialog] = useState(false)
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    password: '',
    name: '',
    isAdmin: false,
  })

  const isAdmin = user?.isAdmin || false

  // Fetch user settings
  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['user-settings'],
    queryFn: async () => {
      const res = await fetch('/api/user/settings', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch settings')
      return res.json()
    },
    enabled: !!user,
  })

  // Fetch all users (admin only)
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await fetch('/api/admin/users', { credentials: 'include' })
      if (!res.ok) {
        if (res.status === 401) {
          return { users: [] }
        }
        throw new Error('Failed to fetch users')
      }
      return res.json()
    },
    enabled: !!user && isAdmin,
  })

  useEffect(() => {
    if (settingsData) {
      setHasApiKey(settingsData.hasGoogleAiApiKey)
      // Don't populate the input with actual key for security
      if (settingsData.hasGoogleAiApiKey) {
        setApiKey('••••••••••••••••••••••••••••••••')
      }
    }
  }, [settingsData])

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { googleAiApiKey: string | null }) => {
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update settings')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Settings saved')
      queryClient.invalidateQueries({ queryKey: ['user-settings'] })
      setShowApiKey(false)
      setApiKey('')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key')
      return
    }

    // If showing masked key, don't update
    if (apiKey.includes('•')) {
      toast.info('No changes to save')
      return
    }

    updateMutation.mutate({ googleAiApiKey: apiKey.trim() })
  }

  const handleClearApiKey = () => {
    if (confirm('Are you sure you want to clear your API key? You will need to use the global API key.')) {
      updateMutation.mutate({ googleAiApiKey: null })
    }
  }

  // Create user mutation (admin only)
  const createUserMutation = useMutation({
    mutationFn: async (data: typeof newUserForm) => {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create user')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('User created successfully')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setShowCreateUserDialog(false)
      setNewUserForm({ email: '', password: '', name: '', isAdmin: false })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Delete user mutation (admin only)
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await fetch(`/api/admin/users?id=${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete user')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('User deleted')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const users: User[] = usersData?.users || []

  if (authLoading || settingsLoading) {
    return (
      <div className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-100">Settings</h1>
          <p className="text-slate-400 mt-1">Manage your account settings and API keys</p>
        </div>

        {/* Google AI API Key Section */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Google Gen AI API Key
                </CardTitle>
                <CardDescription className="text-slate-400 mt-1">
                  Use your own Google AI API key for image generation. If not set, the global API key will be used.
                </CardDescription>
              </div>
              {hasApiKey && (
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Configured
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm text-blue-300">
                  <p>
                    <strong>Why use your own API key?</strong>
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2 text-blue-200">
                    <li>Control your own API usage and costs</li>
                    <li>Higher rate limits</li>
                    <li>Better privacy and data control</li>
                  </ul>
                  <p className="mt-2">
                    Get your API key from{' '}
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-blue-100"
                    >
                      Google AI Studio
                    </a>
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => {
                      // Don't allow editing if showing masked key
                      if (!apiKey.includes('•')) {
                        setApiKey(e.target.value)
                      }
                    }}
                    onFocus={() => {
                      // Clear masked value when focusing
                      if (apiKey.includes('•')) {
                        setApiKey('')
                      }
                    }}
                    placeholder={hasApiKey ? 'Enter new API key or leave unchanged' : 'Enter your Google AI API key'}
                    className="bg-slate-800 border-slate-700 text-slate-100 pr-10"
                    disabled={updateMutation.isPending}
                  />
                  {apiKey && !apiKey.includes('•') && (
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
                <Button
                  onClick={handleSaveApiKey}
                  disabled={updateMutation.isPending || (apiKey.includes('•') && hasApiKey)}
                  className="bg-indigo-600 hover:bg-indigo-500"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save
                </Button>
              </div>
              {hasApiKey && (
                <Button
                  variant="outline"
                  onClick={handleClearApiKey}
                  disabled={updateMutation.isPending}
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  Clear API Key
                </Button>
              )}
            </div>

            {hasApiKey && apiKey.includes('•') && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <AlertCircle className="h-4 w-4" />
                <span>API key is configured. Enter a new key above to update it.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Information */}
        <Card className="bg-slate-900/50 border-slate-800 mt-6">
          <CardHeader>
            <CardTitle className="text-slate-100">Account Information</CardTitle>
            <CardDescription className="text-slate-400">Your account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-slate-400 text-sm">Email</Label>
              <p className="text-slate-200 mt-1">{settingsData?.email || user?.email}</p>
            </div>
            <div>
              <Label className="text-slate-400 text-sm">Name</Label>
              <p className="text-slate-200 mt-1">{settingsData?.name || user?.name || 'Not set'}</p>
            </div>
            {isAdmin && (
              <div>
                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                  <Shield className="h-3 w-3 mr-1" />
                  Administrator
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* User Management (Admin Only) */}
        {isAdmin && (
          <Card className="bg-slate-900/50 border-slate-800 mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-slate-100 flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    User Management
                  </CardTitle>
                  <CardDescription className="text-slate-400 mt-1">
                    Create and manage user accounts
                  </CardDescription>
                </div>
                <Button
                  onClick={() => setShowCreateUserDialog(true)}
                  className="bg-indigo-600 hover:bg-indigo-500"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create User
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Users className="h-12 w-12 mx-auto mb-3 text-slate-600" />
                  <p>No users found</p>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400">Name</TableHead>
                        <TableHead className="text-slate-400">Email</TableHead>
                        <TableHead className="text-slate-400">Role</TableHead>
                        <TableHead className="text-slate-400">Created</TableHead>
                        <TableHead className="text-slate-400 w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id} className="border-slate-800 hover:bg-slate-800/50">
                          <TableCell className="text-slate-200">
                            {u.name || '—'}
                          </TableCell>
                          <TableCell className="text-slate-300">{u.email}</TableCell>
                          <TableCell>
                            {u.isAdmin ? (
                              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                                <Shield className="h-3 w-3 mr-1" />
                                Admin
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-slate-800 text-slate-400 border-slate-700">
                                User
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-slate-400 text-sm">
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell>
                            {u.id !== user?.id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm(`Delete user ${u.email}? This action cannot be undone.`)) {
                                    deleteUserMutation.mutate(u.id)
                                  }
                                }}
                                disabled={deleteUserMutation.isPending}
                                className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create User Dialog */}
      <Dialog open={showCreateUserDialog} onOpenChange={setShowCreateUserDialog}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Create New User</DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a new user account. They will be able to sign in immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Email *</Label>
              <Input
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                className="bg-slate-800 border-slate-700 text-slate-100"
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Password *</Label>
              <Input
                type="password"
                value={newUserForm.password}
                onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                className="bg-slate-800 border-slate-700 text-slate-100"
                placeholder="Minimum 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Name (optional)</Label>
              <Input
                type="text"
                value={newUserForm.name}
                onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
                className="bg-slate-800 border-slate-700 text-slate-100"
                placeholder="User's full name"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isAdmin"
                checked={newUserForm.isAdmin}
                onChange={(e) => setNewUserForm({ ...newUserForm, isAdmin: e.target.checked })}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
              />
              <Label htmlFor="isAdmin" className="text-slate-300 cursor-pointer">
                Grant administrator privileges
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateUserDialog(false)
                setNewUserForm({ email: '', password: '', name: '', isAdmin: false })
              }}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createUserMutation.mutate(newUserForm)}
              disabled={!newUserForm.email || !newUserForm.password || createUserMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-500"
            >
              {createUserMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
