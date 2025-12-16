import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Loader2,
  ShoppingBag,
  RefreshCw,
  Search,
  Plus,
  Settings,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Trash2,
  ImagePlus,
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/products/')({
  component: ProductsPage,
})

interface Product {
  id: number
  wooId: number
  connectionId: number | null
  productType: 'simple' | 'variable' | 'variation' | 'grouped' | 'external' | null
  parentId: number | null
  name: string
  slug: string | null
  sku: string | null
  description: string | null
  shortDescription: string | null
  price: string | null
  regularPrice: string | null
  salePrice: string | null
  stockStatus: string | null
  stockQuantity: number | null
  categories: string[] | null
  tags: string[] | null
  images: { src: string; alt: string }[] | null
  attributes: { name: string; options: string[]; variation?: boolean }[] | null
  variantAttributes: { name: string; option: string }[] | null
  permalink: string | null
  syncedAt: Date | null
  createdAt: Date | null
}

interface WooConnection {
  id: number
  name: string
  storeUrl: string
  isActive: boolean
  lastSyncAt: Date | null
}

interface SyncJob {
  id: number
  connectionId: number
  status: 'pending' | 'fetching' | 'processing' | 'completed' | 'failed'
  totalProducts: number
  processedProducts: number
  createdProducts: number
  updatedProducts: number
  skippedProducts: number
  onlyInStock: boolean
  errorMessage: string | null
  startedAt: Date | null
  completedAt: Date | null
}

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

function ProductsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, isLoading: authLoading } = useAuth()

  const [search, setSearch] = useState('')
  const [selectedConnection, setSelectedConnection] = useState<string>('all')
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)
  
  // Sync dialog state
  const [showSyncDialog, setShowSyncDialog] = useState(false)
  const [syncConnectionId, setSyncConnectionId] = useState<number | null>(null)
  const [syncOnlyInStock, setSyncOnlyInStock] = useState(false)
  const [activeSyncJob, setActiveSyncJob] = useState<SyncJob | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: '/auth/login' })
    }
  }, [user, authLoading, navigate])

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [search, selectedConnection])

  // Poll for sync job status
  useEffect(() => {
    if (!activeSyncJob || activeSyncJob.status === 'completed' || activeSyncJob.status === 'failed') {
      return
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/woo/sync?jobId=${activeSyncJob.id}`, { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setActiveSyncJob(data.job)
          
          if (data.job.status === 'completed') {
            toast.success(`Sync completed! ${data.job.createdProducts} new, ${data.job.updatedProducts} updated`)
            queryClient.invalidateQueries({ queryKey: ['products'] })
            queryClient.invalidateQueries({ queryKey: ['woo-connections'] })
          } else if (data.job.status === 'failed') {
            toast.error(`Sync failed: ${data.job.errorMessage}`)
          }
        }
      } catch (error) {
        console.error('Failed to poll sync status:', error)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [activeSyncJob, queryClient])

  // Fetch connections
  const { data: connectionsData } = useQuery({
    queryKey: ['woo-connections'],
    queryFn: async () => {
      const res = await fetch('/api/woo/connections', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch connections')
      return res.json()
    },
    enabled: !!user,
  })

  // Fetch products
  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', selectedConnection, search],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedConnection !== 'all') {
        params.set('connectionId', selectedConnection)
      }
      if (search) {
        params.set('search', search)
      }
      const res = await fetch(`/api/products/?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch products')
      return res.json()
    },
    enabled: !!user,
  })

  // Start sync mutation
  const startSyncMutation = useMutation({
    mutationFn: async ({ connectionId, onlyInStock }: { connectionId: number; onlyInStock: boolean }) => {
      const res = await fetch('/api/woo/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connectionId, onlyInStock }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to start sync')
      }
      return res.json()
    },
    onSuccess: (data) => {
      setActiveSyncJob(data.job)
      setShowSyncDialog(false)
      toast.success('Sync started!')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Delete product mutation
  const deleteMutation = useMutation({
    mutationFn: async (productId: number) => {
      const res = await fetch(`/api/products/?id=${productId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Delete failed')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Product deleted')
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const handleOpenSyncDialog = (connectionId: number) => {
    setSyncConnectionId(connectionId)
    setSyncOnlyInStock(false)
    setShowSyncDialog(true)
  }

  const handleStartSync = () => {
    if (!syncConnectionId) return
    startSyncMutation.mutate({ connectionId: syncConnectionId, onlyInStock: syncOnlyInStock })
  }

  const connections: WooConnection[] = connectionsData?.connections || []
  const allProducts: Product[] = productsData?.products || []
  
  // Pagination calculations
  const totalProducts = allProducts.length
  const totalPages = Math.ceil(totalProducts / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const products = allProducts.slice(startIndex, endIndex)

  const isSyncing = activeSyncJob && (activeSyncJob.status === 'pending' || activeSyncJob.status === 'fetching' || activeSyncJob.status === 'processing')
  const syncProgress = activeSyncJob && activeSyncJob.totalProducts > 0 
    ? Math.round((activeSyncJob.processedProducts / activeSyncJob.totalProducts) * 100) 
    : 0

  const getStockStatusBadge = (status: string | null) => {
    if (status === 'instock') {
      return (
        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs">
          In Stock
        </Badge>
      )
    } else if (status === 'outofstock') {
      return (
        <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs">
          Out of Stock
        </Badge>
      )
    }
    return (
      <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs">
        {status || 'Unknown'}
      </Badge>
    )
  }

  const getProductTypeBadge = (type: string | null) => {
    switch (type) {
      case 'variable':
        return (
          <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
            Variable
          </Badge>
        )
      case 'variation':
        return (
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">
            Variation
          </Badge>
        )
      case 'grouped':
        return (
          <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-xs">
            Grouped
          </Badge>
        )
      case 'external':
        return (
          <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-xs">
            External
          </Badge>
        )
      case 'simple':
      default:
        return (
          <Badge className="bg-slate-500/20 text-slate-300 border-slate-500/30 text-xs">
            Simple
          </Badge>
        )
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Sync Progress Bar */}
        {isSyncing && activeSyncJob && (
          <div className="mb-6 p-4 rounded-xl bg-slate-900/80 border border-indigo-500/30 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                  <RefreshCw className="h-4 w-4 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <div>
                  <div className="font-medium text-slate-100">
                    {activeSyncJob.status === 'fetching' ? 'Fetching products from WooCommerce...' : 
                     activeSyncJob.status === 'processing' ? 'Processing products...' : 
                     'Starting sync...'}
                  </div>
                  <div className="text-sm text-slate-400">
                    {activeSyncJob.processedProducts} of {activeSyncJob.totalProducts} products
                    {activeSyncJob.createdProducts > 0 && ` • ${activeSyncJob.createdProducts} new`}
                    {activeSyncJob.updatedProducts > 0 && ` • ${activeSyncJob.updatedProducts} updated`}
                  </div>
                </div>
              </div>
              <div className="text-2xl font-bold text-indigo-400">
                {syncProgress}%
              </div>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300 ease-out"
                style={{ width: `${syncProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2 flex items-center gap-3">
              <ShoppingBag className="h-8 w-8 text-purple-400" />
              Products
            </h1>
            <p className="text-slate-400">
              Manage your synced WooCommerce products
            </p>
          </div>
          <div className="flex items-center gap-3">
            {connections.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Sync Products
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800">
                  {connections.map((conn) => (
                    <DropdownMenuItem
                      key={conn.id}
                      onClick={() => handleOpenSyncDialog(conn.id)}
                      disabled={!conn.isActive || isSyncing}
                      className="text-slate-300 focus:bg-slate-800 focus:text-slate-100"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sync from {conn.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Link to="/settings/woocommerce">
              <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search products by name, SKU, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-500"
            />
          </div>
          {connections.length > 0 && (
            <Select value={selectedConnection} onValueChange={setSelectedConnection}>
              <SelectTrigger className="w-48 bg-slate-800/50 border-slate-700 text-slate-100">
                <SelectValue placeholder="All stores" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                <SelectItem value="all" className="text-slate-300">All stores</SelectItem>
                {connections.map((conn) => (
                  <SelectItem key={conn.id} value={conn.id.toString()} className="text-slate-300">
                    {conn.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Products Table or Empty State */}
        {productsLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
          </div>
        ) : allProducts.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="py-16">
              <div className="text-center">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mx-auto mb-6">
                  <ShoppingBag className="h-10 w-10 text-purple-400" />
                </div>
                <h2 className="text-xl font-semibold text-slate-100 mb-2">
                  {search ? 'No products found' : 'No products synced yet'}
                </h2>
                <p className="text-slate-400 max-w-md mx-auto mb-6">
                  {search
                    ? 'Try adjusting your search or filters'
                    : 'Connect your WooCommerce store to start syncing products.'}
                </p>
                {!search && connections.length === 0 && (
                  <Link to="/settings/woocommerce">
                    <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500">
                      <Plus className="h-4 w-4 mr-2" />
                      Connect WooCommerce
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-slate-900/50 border-slate-800">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-400 w-16">Image</TableHead>
                  <TableHead className="text-slate-400">Product</TableHead>
                  <TableHead className="text-slate-400 w-24">Type</TableHead>
                  <TableHead className="text-slate-400">SKU</TableHead>
                  <TableHead className="text-slate-400">Price</TableHead>
                  <TableHead className="text-slate-400">Stock</TableHead>
                  <TableHead className="text-slate-400">Category</TableHead>
                  <TableHead className="text-slate-400 w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                    <TableRow 
                    key={product.id} 
                    className="border-slate-800 hover:bg-slate-800/50 cursor-pointer"
                    onClick={() => navigate({ to: '/products/$productId', params: { productId: product.id.toString() } })}
                  >
                    <TableCell>
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-800 flex items-center justify-center">
                        {product.images && product.images.length > 0 ? (
                          <img
                            src={product.images[0].src}
                            alt={product.images[0].alt || product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="h-5 w-5 text-slate-600" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium text-slate-100 line-clamp-1">{product.name}</div>
                        {product.shortDescription && (
                          <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                            {product.shortDescription.replace(/<[^>]*>/g, '')}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getProductTypeBadge(product.productType)}
                    </TableCell>
                    <TableCell className="text-slate-400 text-sm">
                      {product.sku || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-emerald-400">
                          ${product.price || product.regularPrice || '0.00'}
                        </span>
                        {product.salePrice && product.regularPrice && product.salePrice !== product.regularPrice && (
                          <span className="text-xs text-slate-500 line-through">
                            ${product.regularPrice}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStockStatusBadge(product.stockStatus)}
                    </TableCell>
                    <TableCell className="text-slate-400 text-sm">
                      {product.categories && product.categories.length > 0 
                        ? product.categories[0] 
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-100">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800">
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); navigate({ to: '/products/$productId', params: { productId: product.id.toString() } }) }}
                            className="text-slate-300 focus:bg-slate-800 focus:text-slate-100"
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); navigate({ to: '/generate', search: { productId: product.id } }) }}
                            className="text-slate-300 focus:bg-slate-800 focus:text-slate-100"
                          >
                            <ImagePlus className="h-4 w-4 mr-2" />
                            Generate Images
                          </DropdownMenuItem>
                          {product.permalink && (
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); window.open(product.permalink!, '_blank') }}
                              className="text-slate-300 focus:bg-slate-800 focus:text-slate-100"
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View in Store
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator className="bg-slate-800" />
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm('Are you sure you want to delete this product?')) {
                                deleteMutation.mutate(product.id)
                              }
                            }}
                            className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-4 border-t border-slate-800">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <span>Showing</span>
                <Select value={itemsPerPage.toString()} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1) }}>
                  <SelectTrigger className="w-20 h-8 bg-slate-800 border-slate-700 text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option.toString()} className="text-slate-300">
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>of {totalProducts} products</span>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <div className="flex items-center gap-1 mx-2">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'default' : 'outline'}
                        size="icon"
                        className={`h-8 w-8 ${
                          currentPage === pageNum
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                        }`}
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-slate-700 text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Sync Options Dialog */}
      <Dialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Sync Products</DialogTitle>
            <DialogDescription className="text-slate-400">
              Configure sync options before starting.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <div>
                <Label className="text-slate-200 font-medium">Only in-stock products</Label>
                <p className="text-sm text-slate-400 mt-1">
                  Skip products that are out of stock
                </p>
              </div>
              <Switch
                checked={syncOnlyInStock}
                onCheckedChange={setSyncOnlyInStock}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSyncDialog(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleStartSync}
              disabled={startSyncMutation.isPending}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500"
            >
              {startSyncMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Start Sync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
