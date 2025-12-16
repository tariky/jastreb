import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Loader2,
  Plus,
  Store,
  Key,
  Globe,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/settings/woocommerce')({
  component: WooCommerceSettingsPage,
})

interface WooConnection {
  id: number
  name: string
  storeUrl: string
  isActive: boolean
  lastSyncAt: Date | null
  createdAt: Date | null
}

interface ConnectionForm {
  name: string
  storeUrl: string
  consumerKey: string
  consumerSecret: string
}

const emptyForm: ConnectionForm = {
  name: '',
  storeUrl: '',
  consumerKey: '',
  consumerSecret: '',
}

function WooCommerceSettingsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, isLoading: authLoading } = useAuth()

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingConnection, setEditingConnection] = useState<WooConnection | null>(null)
  const [deletingConnection, setDeletingConnection] = useState<WooConnection | null>(null)
  const [form, setForm] = useState<ConnectionForm>(emptyForm)
  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: '/auth/login' })
    }
  }, [user, authLoading, navigate])

  // Fetch connections
  const { data: connectionsData, isLoading: connectionsLoading } = useQuery({
    queryKey: ['woo-connections'],
    queryFn: async () => {
      const res = await fetch('/api/woo/connections', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch connections')
      return res.json()
    },
    enabled: !!user,
  })

  // Create connection mutation
  const createMutation = useMutation({
    mutationFn: async (data: ConnectionForm) => {
      const res = await fetch('/api/woo/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create connection')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Connection created successfully')
      queryClient.invalidateQueries({ queryKey: ['woo-connections'] })
      setShowAddDialog(false)
      setForm(emptyForm)
      setTestResult(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Update connection mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: number } & Partial<ConnectionForm> & { isActive?: boolean }) => {
      const res = await fetch('/api/woo/connections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update connection')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Connection updated')
      queryClient.invalidateQueries({ queryKey: ['woo-connections'] })
      setEditingConnection(null)
      setForm(emptyForm)
      setTestResult(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Delete connection mutation
  const deleteMutation = useMutation({
    mutationFn: async (connectionId: number) => {
      const res = await fetch(`/api/woo/connections?id=${connectionId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete connection')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Connection deleted')
      queryClient.invalidateQueries({ queryKey: ['woo-connections'] })
      setDeletingConnection(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Test connection
  const handleTestConnection = async () => {
    if (!form.storeUrl || !form.consumerKey || !form.consumerSecret) {
      toast.error('Please fill in all connection details')
      return
    }

    setTestingConnection(true)
    setTestResult(null)

    try {
      const res = await fetch('/api/woo/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'test',
          storeUrl: form.storeUrl,
          consumerKey: form.consumerKey,
          consumerSecret: form.consumerSecret,
        }),
      })
      const result = await res.json()
      setTestResult(result)
      if (result.success) {
        toast.success('Connection successful!')
      } else {
        toast.error(`Connection failed: ${result.error}`)
      }
    } catch (error: any) {
      setTestResult({ success: false, error: error.message })
      toast.error(`Connection failed: ${error.message}`)
    } finally {
      setTestingConnection(false)
    }
  }

  const handleOpenAddDialog = () => {
    setForm(emptyForm)
    setTestResult(null)
    setShowAddDialog(true)
  }

  const handleOpenEditDialog = (connection: WooConnection) => {
    setEditingConnection(connection)
    setForm({
      name: connection.name,
      storeUrl: connection.storeUrl,
      consumerKey: '',
      consumerSecret: '',
    })
    setTestResult(null)
  }

  const handleToggleActive = (connection: WooConnection) => {
    updateMutation.mutate({ id: connection.id, isActive: !connection.isActive })
  }

  const connections: WooConnection[] = connectionsData?.connections || []

  if (authLoading) {
    return (
      <div className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate({ to: '/products' })}
            className="text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-100 mb-1 flex items-center gap-3">
              <Store className="h-8 w-8 text-indigo-400" />
              WooCommerce Settings
            </h1>
            <p className="text-slate-400">
              Manage your WooCommerce store connections
            </p>
          </div>
          <Button
            onClick={handleOpenAddDialog}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Connection
          </Button>
        </div>

        {/* Connections List */}
        {connectionsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          </div>
        ) : connections.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="py-16">
              <div className="text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center mx-auto mb-6">
                  <Store className="h-10 w-10 text-indigo-400" />
                </div>
                <h2 className="text-xl font-semibold text-slate-100 mb-2">
                  No connections yet
                </h2>
                <p className="text-slate-400 max-w-md mx-auto mb-6">
                  Connect your WooCommerce store to start syncing products. You'll need your store URL and API keys.
                </p>
                <Button
                  onClick={handleOpenAddDialog}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Connection
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {connections.map((connection) => (
              <Card key={connection.id} className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center shrink-0">
                        <Store className="h-6 w-6 text-indigo-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-100">{connection.name}</h3>
                          {connection.isActive ? (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                              <XCircle className="h-3 w-3 mr-1" />
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-slate-400 mb-2">
                          <Globe className="h-4 w-4" />
                          {connection.storeUrl}
                        </div>
                        {connection.lastSyncAt && (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Clock className="h-3 w-3" />
                            Last synced: {new Date(connection.lastSyncAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-slate-400">Active</Label>
                        <Switch
                          checked={connection.isActive}
                          onCheckedChange={() => handleToggleActive(connection)}
                          disabled={updateMutation.isPending}
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleOpenEditDialog(connection)}
                        className="border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setDeletingConnection(connection)}
                        className="border-slate-700 text-red-400 hover:text-red-300 hover:bg-red-500/10 hover:border-red-500/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Info Card */}
        <Card className="bg-slate-900/30 border-slate-800 mt-8">
          <CardHeader>
            <CardTitle className="text-slate-200 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-400" />
              How to get WooCommerce API keys
            </CardTitle>
          </CardHeader>
          <CardContent className="text-slate-400 text-sm space-y-2">
            <p>1. Log in to your WordPress admin dashboard</p>
            <p>2. Go to WooCommerce → Settings → Advanced → REST API</p>
            <p>3. Click "Add key" to create a new API key</p>
            <p>4. Set permissions to "Read" (or "Read/Write" if you want to sync back)</p>
            <p>5. Copy the Consumer Key and Consumer Secret</p>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Connection Dialog */}
      <Dialog
        open={showAddDialog || !!editingConnection}
        onOpenChange={(open) => {
          if (!open) {
            setShowAddDialog(false)
            setEditingConnection(null)
          }
        }}
      >
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {editingConnection ? 'Edit Connection' : 'Add WooCommerce Connection'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {editingConnection
                ? 'Update your connection details. Leave API keys empty to keep existing ones.'
                : 'Enter your WooCommerce store details and API credentials.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Connection Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="My Store"
                className="bg-slate-800 border-slate-700 text-slate-100"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Store URL</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  value={form.storeUrl}
                  onChange={(e) => setForm({ ...form, storeUrl: e.target.value })}
                  placeholder="https://yourstore.com"
                  className="pl-10 bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Consumer Key</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  value={form.consumerKey}
                  onChange={(e) => setForm({ ...form, consumerKey: e.target.value })}
                  placeholder={editingConnection ? '(leave empty to keep existing)' : 'ck_xxxxxxxxxxxxxxxx'}
                  className="pl-10 bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Consumer Secret</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <Input
                  type="password"
                  value={form.consumerSecret}
                  onChange={(e) => setForm({ ...form, consumerSecret: e.target.value })}
                  placeholder={editingConnection ? '(leave empty to keep existing)' : 'cs_xxxxxxxxxxxxxxxx'}
                  className="pl-10 bg-slate-800 border-slate-700 text-slate-100"
                />
              </div>
            </div>

            {/* Test Result */}
            {testResult && (
              <div
                className={`p-3 rounded-lg flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}
              >
                {testResult.success ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Connection successful!
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    {testResult.error || 'Connection failed'}
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testingConnection || !form.storeUrl || !form.consumerKey || !form.consumerSecret}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              {testingConnection ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </Button>
            <Button
              onClick={() => {
                if (editingConnection) {
                  const updateData: any = { id: editingConnection.id, name: form.name, storeUrl: form.storeUrl }
                  if (form.consumerKey) updateData.consumerKey = form.consumerKey
                  if (form.consumerSecret) updateData.consumerSecret = form.consumerSecret
                  updateMutation.mutate(updateData)
                } else {
                  createMutation.mutate(form)
                }
              }}
              disabled={
                createMutation.isPending ||
                updateMutation.isPending ||
                !form.name ||
                !form.storeUrl ||
                (!editingConnection && (!form.consumerKey || !form.consumerSecret))
              }
              className="bg-indigo-600 hover:bg-indigo-500"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingConnection ? 'Save Changes' : 'Add Connection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingConnection} onOpenChange={(open) => !open && setDeletingConnection(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Delete Connection</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete "{deletingConnection?.name}"? This will not delete any synced products,
              but you won't be able to sync new products from this store.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingConnection && deleteMutation.mutate(deletingConnection.id)}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
