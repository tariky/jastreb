import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
// Dialog not currently used but may be needed
// import {
//   Dialog,
//   DialogContent,
//   DialogDescription,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
// } from '@/components/ui/dialog'
import {
  Loader2,
  ArrowLeft,
  Save,
  Sparkles,
  Send,
  Image as ImageIcon,
  Video,
  Star,
  Trash2,
  Upload,
  ExternalLink,
  Package,
  Plus,
  Layout,
  Zap,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/products/$productId')({
  component: ProductDetailPage,
})

interface ProductVariant {
  id: number
  wooId: number
  name: string
  sku: string | null
  price: string | null
  regularPrice: string | null
  salePrice: string | null
  stockStatus: string | null
  stockQuantity: number | null
  images: { src: string; alt: string }[] | null
  variantAttributes: { name: string; option: string }[] | null
}

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
  variants?: ProductVariant[]
}

interface ProductMedia {
  id: number
  productId: number
  type: 'image' | 'video' | 'satori'
  source: 'woocommerce' | 'gemini' | 'upload' | 'satori'
  url: string
  localPath: string | null
  mimeType: string | null
  width: number | null
  height: number | null
  prompt: string | null
  isPrimary: boolean
  createdAt: Date
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  imageUrl?: string
  timestamp: Date
}

interface Template {
  id: number
  name: string
  description: string | null
  width: number
  height: number
  isDefault: boolean
}

interface TemplateAssignment {
  id: number
  productId: number
  templateId: number
  template?: Template
  customVariables: Record<string, string> | null
}

function ProductDetailPage() {
  const { productId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, isLoading: authLoading } = useAuth()
  
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const [editForm, setEditForm] = useState<Partial<Product>>({})
  const [hasChanges, setHasChanges] = useState(false)
  
  // AI Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [aspectRatio, setAspectRatio] = useState<string>('1:1')
  const [imageSize, setImageSize] = useState<string>('1K')
  const [isGenerating, setIsGenerating] = useState(false)
  const [referenceImages, setReferenceImages] = useState<{ url: string; base64?: string; name: string }[]>([])
  const referenceInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: '/auth/login' })
    }
  }, [user, authLoading, navigate])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Fetch product with variants
  const { data: productData, isLoading: productLoading } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/?id=${productId}&includeVariants=true`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch product')
      return res.json()
    },
    enabled: !!user && !!productId,
  })

  // Fetch product media
  const { data: mediaData, isLoading: mediaLoading } = useQuery({
    queryKey: ['product-media', productId],
    queryFn: async () => {
      const res = await fetch(`/api/media/?productId=${productId}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch media')
      return res.json()
    },
    enabled: !!user && !!productId,
  })

  // Fetch available templates
  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const res = await fetch('/api/templates/', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch templates')
      return res.json()
    },
    enabled: !!user,
  })

  // Fetch template assignments for this product
  const { data: assignmentsData } = useQuery({
    queryKey: ['template-assignments', productId],
    queryFn: async () => {
      const res = await fetch(`/api/templates/assignments?productId=${productId}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch assignments')
      return res.json()
    },
    enabled: !!user && !!productId,
  })

  const templates: Template[] = templatesData?.templates || []
  const assignments: TemplateAssignment[] = assignmentsData?.assignments || []

  // Initialize form when product loads
  useEffect(() => {
    if (productData?.product) {
      const p = productData.product
      setEditForm({
        name: p.name,
        description: p.description || '',
        shortDescription: p.shortDescription || '',
        price: p.price || '',
        regularPrice: p.regularPrice || '',
        salePrice: p.salePrice || '',
        sku: p.sku || '',
        stockStatus: p.stockStatus || '',
      })
    }
  }, [productData])

  // Track changes
  useEffect(() => {
    if (!productData?.product) return
    const p = productData.product
    const changed = 
      editForm.name !== p.name ||
      editForm.description !== (p.description || '') ||
      editForm.shortDescription !== (p.shortDescription || '') ||
      editForm.price !== (p.price || '') ||
      editForm.regularPrice !== (p.regularPrice || '') ||
      editForm.salePrice !== (p.salePrice || '') ||
      editForm.sku !== (p.sku || '') ||
      editForm.stockStatus !== (p.stockStatus || '')
    setHasChanges(changed)
  }, [editForm, productData])

  // Update product mutation
  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Product>) => {
      const res = await fetch('/api/products/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: parseInt(productId), ...data }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Update failed')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Product saved')
      queryClient.invalidateQueries({ queryKey: ['product', productId] })
      setHasChanges(false)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Upload media mutation
  const uploadMediaMutation = useMutation({
    mutationFn: async (data: { 
      base64Data?: string
      url?: string
      type: 'image' | 'video'
      source: string
      prompt?: string
      setAsPrimary?: boolean
      filename?: string
      mimeType?: string
    }) => {
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId: parseInt(productId), ...data }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Upload failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-media', productId] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Set primary mutation
  const setPrimaryMutation = useMutation({
    mutationFn: async ({ id, isPrimary }: { id: number; isPrimary: boolean }) => {
      const res = await fetch('/api/media/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, isPrimary }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Update failed')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Default media updated')
      queryClient.invalidateQueries({ queryKey: ['product-media', productId] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Delete media mutation
  const deleteMediaMutation = useMutation({
    mutationFn: async (mediaId: number) => {
      const res = await fetch(`/api/media/upload?id=${mediaId}`, {
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
      toast.success('Media deleted')
      queryClient.invalidateQueries({ queryKey: ['product-media', productId] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Assign template mutation
  const assignTemplateMutation = useMutation({
    mutationFn: async ({ templateId, applyRules }: { templateId?: number; applyRules?: boolean }) => {
      const res = await fetch('/api/templates/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          productId: parseInt(productId),
          templateId,
          applyRules,
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Assignment failed')
      }
      return res.json()
    },
    onSuccess: (data) => {
      if (data.matchedRule) {
        toast.success(`Template assigned via rule: ${data.matchedRule}`)
      } else if (data.message) {
        toast.info(data.message)
      } else {
        toast.success('Template assigned')
      }
      queryClient.invalidateQueries({ queryKey: ['template-assignments', productId] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Remove template assignment mutation
  const removeAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      const res = await fetch(`/api/templates/assignments?id=${assignmentId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Remove failed')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Template removed')
      queryClient.invalidateQueries({ queryKey: ['template-assignments', productId] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Generate image with AI
  const handleGenerateImage = async () => {
    if (!chatInput.trim() || isGenerating) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: chatInput,
      timestamp: new Date(),
    }
    setChatMessages((prev) => [...prev, userMessage])
    const currentInput = chatInput
    const currentReferences = [...referenceImages]
    setChatInput('')
    setReferenceImages([])
    setIsGenerating(true)

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          prompt: currentInput,
          aspectRatio,
          imageSize,
          referenceImages: currentReferences.filter(img => img.base64).map(img => img.base64),
          productContext: productData?.product ? {
            name: productData.product.name,
            description: productData.product.shortDescription || productData.product.description,
          } : undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.text || 'Image generated successfully!',
        imageUrl: data.imageData ? `data:image/png;base64,${data.imageData}` : undefined,
        timestamp: new Date(),
      }
      setChatMessages((prev) => [...prev, assistantMessage])

      // Auto-save generated image
      if (data.imageData) {
        await uploadMediaMutation.mutateAsync({
          base64Data: data.imageData,
          type: 'image',
          source: 'gemini',
          prompt: currentInput,
          filename: `ai-${Date.now()}.png`,
          mimeType: 'image/png',
        })
        toast.success('Image saved to product media')
      }
    } catch (error: any) {
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: new Date(),
      }
      setChatMessages((prev) => [...prev, errorMessage])
      toast.error(error.message)
    } finally {
      setIsGenerating(false)
    }
  }

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1]
      
      try {
        await uploadMediaMutation.mutateAsync({
          base64Data: base64,
          type,
          source: 'upload',
          filename: file.name,
          mimeType: file.type,
        })
        toast.success(`${type === 'image' ? 'Image' : 'Video'} uploaded`)
      } catch (error) {
        // Error handled by mutation
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Handle adding reference image from file
  const handleAddReferenceFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (referenceImages.length >= 14) {
      toast.error('Maximum 14 reference images allowed')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setReferenceImages((prev) => [...prev, { url: reader.result as string, base64, name: file.name }])
      toast.success('Reference image added')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // Handle adding reference image from URL (WooCommerce or uploaded)
  const handleAddReferenceFromUrl = async (url: string, name: string) => {
    if (referenceImages.length >= 14) {
      toast.error('Maximum 14 reference images allowed')
      return
    }
    if (referenceImages.some((img) => img.url === url)) {
      toast.info('Image already added as reference')
      return
    }

    // Show loading toast
    const loadingToast = toast.loading('Fetching image...')

    try {
      // Use server-side proxy to fetch external images (avoids CORS)
      const proxyResponse = await fetch(`/api/media/proxy?url=${encodeURIComponent(url)}`, {
        credentials: 'include',
      })
      
      if (!proxyResponse.ok) {
        const error = await proxyResponse.json()
        throw new Error(error.error || 'Failed to fetch image')
      }
      
      const { base64 } = await proxyResponse.json()
      
      setReferenceImages((prev) => [...prev, { url, base64, name }])
      toast.dismiss(loadingToast)
      toast.success('Reference image added')
    } catch (error: any) {
      toast.dismiss(loadingToast)
      toast.error(`Failed to add reference: ${error.message}`)
      console.error('Failed to fetch reference image:', error)
    }
  }

  // Remove reference image
  const handleRemoveReference = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index))
  }

  const product: Product | null = productData?.product || null
  const media: ProductMedia[] = mediaData?.media || []
  const images = media.filter((m) => m.type === 'image')
  const videos = media.filter((m) => m.type === 'video')
  const primaryImage = images.find((m) => m.isPrimary)
  const primaryVideo = videos.find((m) => m.isPrimary)

  if (authLoading || productLoading) {
    return (
      <div className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-slate-100 mb-2">Product not found</h2>
          <Link to="/products">
            <Button variant="outline" className="border-slate-700 text-slate-300">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Products
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link to="/products">
              <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-100 hover:bg-slate-800">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-100">{product.name}</h1>
                {product.productType === 'variable' && (
                  <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                    Variable Product
                  </Badge>
                )}
                {product.productType === 'variation' && (
                  <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                    Variation
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-400">SKU: {product.sku || 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {product.permalink && (
              <Button
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => window.open(product.permalink!, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View in Store
              </Button>
            )}
            <Button
              onClick={() => updateMutation.mutate(editForm)}
              disabled={!hasChanges || updateMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-500"
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Product Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Info */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-slate-100">Product Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Product Name</Label>
                  <Input
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">SKU</Label>
                    <Input
                      value={editForm.sku || ''}
                      onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                      className="bg-slate-800 border-slate-700 text-slate-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Stock Status</Label>
                    <Select
                      value={editForm.stockStatus || ''}
                      onValueChange={(value) => setEditForm({ ...editForm, stockStatus: value })}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800">
                        <SelectItem value="instock" className="text-slate-300">In Stock</SelectItem>
                        <SelectItem value="outofstock" className="text-slate-300">Out of Stock</SelectItem>
                        <SelectItem value="onbackorder" className="text-slate-300">On Backorder</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Price</Label>
                    <Input
                      value={editForm.price || ''}
                      onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                      className="bg-slate-800 border-slate-700 text-slate-100"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Regular Price</Label>
                    <Input
                      value={editForm.regularPrice || ''}
                      onChange={(e) => setEditForm({ ...editForm, regularPrice: e.target.value })}
                      className="bg-slate-800 border-slate-700 text-slate-100"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Sale Price</Label>
                    <Input
                      value={editForm.salePrice || ''}
                      onChange={(e) => setEditForm({ ...editForm, salePrice: e.target.value })}
                      className="bg-slate-800 border-slate-700 text-slate-100"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">Short Description</Label>
                  <Textarea
                    value={editForm.shortDescription || ''}
                    onChange={(e) => setEditForm({ ...editForm, shortDescription: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-slate-100 min-h-[80px]"
                  />
                  {editForm.shortDescription && (
                    <div className="mt-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                      <p className="text-xs text-slate-500 mb-2">Preview:</p>
                      <div 
                        className="prose prose-sm prose-invert max-w-none text-slate-300 [&>*]:text-slate-300 [&_a]:text-indigo-400 [&_strong]:text-slate-200 [&_em]:text-slate-300"
                        dangerouslySetInnerHTML={{ __html: editForm.shortDescription }}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">Description</Label>
                
                  {editForm.description && (
                    <div className="mt-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700 max-h-64 overflow-y-auto">
                      <p className="text-xs text-slate-500 mb-2">Preview:</p>
                      <div 
                        className="prose prose-sm prose-invert max-w-none text-slate-300 [&>*]:text-slate-300 [&_a]:text-indigo-400 [&_strong]:text-slate-200 [&_em]:text-slate-300 [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-4"
                        dangerouslySetInnerHTML={{ __html: editForm.description }}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Media Gallery */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-slate-100">Media Gallery</CardTitle>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => handleFileUpload(e, 'image')}
                      accept="image/*"
                      className="hidden"
                    />
                    <input
                      type="file"
                      ref={videoInputRef}
                      onChange={(e) => handleFileUpload(e, 'video')}
                      accept="video/mp4"
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      Upload Image
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => videoInputRef.current?.click()}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      <Video className="h-4 w-4 mr-1" />
                      Upload Video
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="images" className="w-full">
                  <TabsList className="bg-slate-800 border-slate-700">
                    <TabsTrigger value="images" className="data-[state=active]:bg-slate-700">
                      <ImageIcon className="h-4 w-4 mr-2" />
                      Uploaded ({images.length})
                    </TabsTrigger>
                    <TabsTrigger value="woocommerce" className="data-[state=active]:bg-slate-700">
                      <Package className="h-4 w-4 mr-2" />
                      WooCommerce ({product.images?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="videos" className="data-[state=active]:bg-slate-700">
                      <Video className="h-4 w-4 mr-2" />
                      Videos ({videos.length})
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="images" className="mt-4">
                    {images.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        No uploaded images yet. Upload or generate with AI.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {images.map((img) => (
                          <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-800">
                            <img src={img.url} alt="" className="w-full h-full object-cover" />
                            {img.isPrimary && (
                              <div className="absolute top-2 left-2">
                                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                                  <Star className="h-3 w-3 mr-1 fill-current" />
                                  Default
                                </Badge>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                              <div className="flex gap-2">
                                {!img.isPrimary && (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setPrimaryMutation.mutate({ id: img.id, isPrimary: true })}
                                    className="h-8"
                                  >
                                    <Star className="h-3 w-3 mr-1" />
                                    Default
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    if (confirm('Delete this image?')) {
                                      deleteMediaMutation.mutate(img.id)
                                    }
                                  }}
                                  className="h-8"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAddReferenceFromUrl(img.url, `uploaded-${img.id}`)}
                                className="h-8 border-purple-500/50 text-purple-300 hover:bg-purple-500/20"
                                disabled={referenceImages.length >= 14}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Use as Reference
                              </Button>
                            </div>
                            {img.source === 'gemini' && (
                              <div className="absolute bottom-2 left-2">
                                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-xs">
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  AI
                                </Badge>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="woocommerce" className="mt-4">
                    {!product.images || product.images.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        No images from WooCommerce.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {product.images.map((img, index) => (
                          <div key={index} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-800">
                            <img src={img.src} alt={img.alt || product.name} className="w-full h-full object-cover" />
                            <div className="absolute bottom-2 left-2">
                              <Badge className="bg-slate-700/80 text-slate-300 border-slate-600 text-xs">
                                <Package className="h-3 w-3 mr-1" />
                                WooCommerce
                              </Badge>
                            </div>
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAddReferenceFromUrl(img.src, img.alt || `woo-${index}`)}
                                className="h-8 border-purple-500/50 text-purple-300 hover:bg-purple-500/20"
                                disabled={referenceImages.length >= 14}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                Use as Reference
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => window.open(img.src, '_blank')}
                                className="h-8"
                              >
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Open Original
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="videos" className="mt-4">
                    {videos.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        No videos yet. Upload an MP4 video.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        {videos.map((vid) => (
                          <div key={vid.id} className="relative group aspect-video rounded-lg overflow-hidden bg-slate-800">
                            <video src={vid.url} className="w-full h-full object-cover" controls />
                            {vid.isPrimary && (
                              <div className="absolute top-2 left-2">
                                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                                  <Star className="h-3 w-3 mr-1 fill-current" />
                                  Default
                                </Badge>
                              </div>
                            )}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                              {!vid.isPrimary && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setPrimaryMutation.mutate({ id: vid.id, isPrimary: true })}
                                  className="h-8"
                                >
                                  <Star className="h-3 w-3 mr-1" />
                                  Default
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  if (confirm('Delete this video?')) {
                                    deleteMediaMutation.mutate(vid.id)
                                  }
                                }}
                                className="h-8"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Product Variants (for variable products) */}
            {product.productType === 'variable' && product.variants && product.variants.length > 0 && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-slate-100">
                    Product Variants ({product.variants.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {product.variants.map((variant) => (
                      <div
                        key={variant.id}
                        className="flex items-center gap-4 p-3 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer"
                        onClick={() => navigate({ to: '/products/$productId', params: { productId: variant.id.toString() } })}
                      >
                        {/* Variant Image */}
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-700 flex-shrink-0">
                          {variant.images && variant.images.length > 0 ? (
                            <img
                              src={variant.images[0].src}
                              alt={variant.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="h-5 w-5 text-slate-500" />
                            </div>
                          )}
                        </div>

                        {/* Variant Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {variant.variantAttributes && variant.variantAttributes.length > 0 ? (
                              variant.variantAttributes.map((attr, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="bg-slate-700/50 text-slate-300 border-slate-600 text-xs"
                                >
                                  {attr.name}: {attr.option}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-slate-400 truncate">{variant.name}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm">
                            {variant.sku && (
                              <span className="text-slate-500">SKU: {variant.sku}</span>
                            )}
                          </div>
                        </div>

                        {/* Variant Price & Stock */}
                        <div className="text-right flex-shrink-0">
                          <div className="font-medium text-emerald-400">
                            ${variant.price || variant.regularPrice || '0.00'}
                          </div>
                          <div className="text-xs mt-0.5">
                            {variant.stockStatus === 'instock' ? (
                              <span className="text-emerald-400">
                                In Stock{variant.stockQuantity ? ` (${variant.stockQuantity})` : ''}
                              </span>
                            ) : variant.stockStatus === 'outofstock' ? (
                              <span className="text-red-400">Out of Stock</span>
                            ) : (
                              <span className="text-amber-400">{variant.stockStatus}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Product Attributes (for variable products) */}
            {product.productType === 'variable' && product.attributes && product.attributes.length > 0 && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-slate-100">Product Attributes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {product.attributes.map((attr, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-300">{attr.name}</span>
                          {attr.variation && (
                            <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-300 border-purple-500/30">
                              Used for variations
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {attr.options.map((option, j) => (
                            <Badge
                              key={j}
                              variant="secondary"
                              className="bg-slate-800 text-slate-300 text-xs"
                            >
                              {option}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Variation Info (for variation products) */}
            {product.productType === 'variation' && product.variantAttributes && product.variantAttributes.length > 0 && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-slate-100">Variation Attributes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {product.variantAttributes.map((attr, i) => (
                      <Badge
                        key={i}
                        className="bg-blue-500/20 text-blue-300 border-blue-500/30"
                      >
                        {attr.name}: {attr.option}
                      </Badge>
                    ))}
                  </div>
                  {product.parentId && (
                    <Button
                      variant="link"
                      className="text-slate-400 hover:text-slate-200 p-0 mt-3"
                      onClick={() => navigate({ to: '/products/$productId', params: { productId: product.parentId!.toString() } })}
                    >
                      ← View parent product
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Templates Section */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-slate-100 flex items-center gap-2">
                    <Layout className="h-5 w-5" />
                    Image Templates
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => assignTemplateMutation.mutate({ applyRules: true })}
                      disabled={assignTemplateMutation.isPending}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      {assignTemplateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4 mr-1" />
                      )}
                      Auto-assign
                    </Button>
                    <Select
                      value=""
                      onValueChange={(templateId) => {
                        if (templateId) {
                          assignTemplateMutation.mutate({ templateId: parseInt(templateId) })
                        }
                      }}
                    >
                      <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-sm h-8">
                        <Plus className="h-4 w-4 mr-1" />
                        <span>Add Template</span>
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800">
                        {templates
                          .filter((t) => !assignments.some((a) => a.templateId === t.id))
                          .map((t) => (
                            <SelectItem key={t.id} value={t.id.toString()} className="text-slate-300">
                              {t.name}
                              {t.isDefault && (
                                <Badge className="ml-2 text-xs bg-amber-500/20 text-amber-300 border-amber-500/30">
                                  Default
                                </Badge>
                              )}
                            </SelectItem>
                          ))}
                        {templates.filter((t) => !assignments.some((a) => a.templateId === t.id)).length === 0 && (
                          <div className="text-sm text-slate-500 p-2">No templates available</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {assignments.length === 0 ? (
                  <div className="text-center py-6 text-slate-500">
                    <Layout className="h-8 w-8 mx-auto mb-2 text-slate-600" />
                    <p className="text-sm">No templates assigned</p>
                    <p className="text-xs mt-1">Add a template or use auto-assign with rules</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assignments.map((assignment) => (
                      <div
                        key={assignment.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                            <Layout className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h4 className="font-medium text-slate-100">{assignment.template?.name || 'Unknown Template'}</h4>
                            <p className="text-xs text-slate-500">
                              {assignment.template?.width} × {assignment.template?.height}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link to="/templates/$templateId" params={{ templateId: assignment.templateId.toString() }}>
                            <Button variant="ghost" size="sm" className="h-8 text-slate-400 hover:text-slate-100">
                              Edit
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => {
                              if (confirm('Remove this template from the product?')) {
                                removeAssignmentMutation.mutate(assignment.id)
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {templates.length === 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-800">
                    <Link to="/templates">
                      <Button variant="link" className="text-indigo-400 hover:text-indigo-300 p-0 h-auto">
                        Create your first template →
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - AI Chat */}
          <div className="lg:col-span-1">
            <Card className="bg-slate-900/50 border-slate-800 h-[calc(100dvh-12rem)] flex flex-col">
              <CardHeader className="shrink-0 border-b border-slate-800">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-slate-100 flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-400" />
                    AI Image Generator
                  </CardTitle>
                  <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                    Gemini 3 Pro
                  </Badge>
                </div>
              </CardHeader>
              
              {/* Chat Messages */}
              <ScrollArea className="flex-1 p-4">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-4">
                      <Sparkles className="h-8 w-8 text-purple-400" />
                    </div>
                    <h3 className="font-medium text-slate-200 mb-2">Generate Product Images</h3>
                    <p className="text-sm text-slate-500 mb-4">
                      Describe the image you want to create for this product
                    </p>
                    <div className="text-xs text-slate-600 space-y-1">
                      <p>Try: "Product photo on white background"</p>
                      <p>Or: "Lifestyle shot in modern kitchen"</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                            msg.role === 'user'
                              ? 'bg-indigo-600'
                              : 'bg-gradient-to-br from-purple-500 to-pink-500'
                          }`}
                        >
                          {msg.role === 'user' ? (
                            <span className="text-xs text-white">{user?.name?.[0] || 'U'}</span>
                          ) : (
                            <Sparkles className="h-3.5 w-3.5 text-white" />
                          )}
                        </div>
                        <div className={`flex-1 max-w-[85%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                          <div
                            className={`inline-block p-2.5 rounded-xl text-sm ${
                              msg.role === 'user'
                                ? 'bg-indigo-600 text-white rounded-tr-sm'
                                : 'bg-slate-800 text-slate-200 rounded-tl-sm'
                            }`}
                          >
                            {msg.content}
                          </div>
                          {msg.imageUrl && (
                            <div className="mt-2">
                              <img
                                src={msg.imageUrl}
                                alt="Generated"
                                className="rounded-lg max-w-full shadow-lg"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isGenerating && (
                      <div className="flex gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                          <Sparkles className="h-3.5 w-3.5 text-white animate-pulse" />
                        </div>
                        <div className="flex-1">
                          <div className="inline-flex items-center gap-2 p-2.5 rounded-xl bg-slate-800 text-slate-400 rounded-tl-sm text-sm">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Generating...
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Reference Images Preview */}
              {referenceImages.length > 0 && (
                <div className="shrink-0 px-4 py-2 border-t border-slate-800 bg-slate-800/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-slate-400">Reference images ({referenceImages.length}/14):</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReferenceImages([])}
                      className="h-6 text-xs text-slate-500 hover:text-slate-300"
                    >
                      Clear all
                    </Button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {referenceImages.map((img, i) => (
                      <div key={i} className="relative shrink-0">
                        <img
                          src={img.url}
                          alt={img.name}
                          className="h-12 w-12 object-cover rounded-lg border border-slate-700"
                        />
                        <button
                          onClick={() => handleRemoveReference(i)}
                          className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center"
                        >
                          <XCircle className="h-3 w-3 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat Input */}
              <div className="shrink-0 p-4 border-t border-slate-800 space-y-3">
                <div className="flex gap-2">
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger className="w-24 h-8 bg-slate-800 border-slate-700 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800">
                      <SelectItem value="1:1" className="text-slate-300 text-xs">1:1</SelectItem>
                      <SelectItem value="4:3" className="text-slate-300 text-xs">4:3</SelectItem>
                      <SelectItem value="16:9" className="text-slate-300 text-xs">16:9</SelectItem>
                      <SelectItem value="9:16" className="text-slate-300 text-xs">9:16</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={imageSize} onValueChange={setImageSize}>
                    <SelectTrigger className="w-20 h-8 bg-slate-800 border-slate-700 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800">
                      <SelectItem value="1K" className="text-slate-300 text-xs">1K</SelectItem>
                      <SelectItem value="2K" className="text-slate-300 text-xs">2K</SelectItem>
                      <SelectItem value="4K" className="text-slate-300 text-xs">4K</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    type="file"
                    ref={referenceInputRef}
                    onChange={handleAddReferenceFromFile}
                    accept="image/*"
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => referenceInputRef.current?.click()}
                    className="h-8 border-slate-700 text-slate-400 hover:text-slate-200"
                    disabled={referenceImages.length >= 14}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Reference
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleGenerateImage()
                      }
                    }}
                    placeholder={referenceImages.length > 0 ? "Describe how to use these references..." : "Describe the image to generate..."}
                    className="flex-1 bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500 h-10 text-sm"
                    disabled={isGenerating}
                  />
                  <Button
                    onClick={handleGenerateImage}
                    disabled={!chatInput.trim() || isGenerating}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 h-10 px-4"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
