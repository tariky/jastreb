import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2,
  ArrowLeft,
  Save,
  Eye,
  Code,
  Settings2,
  RefreshCw,
  Palette,
  Type,
  Image as ImageIcon,
  Star,
  Copy,
  Package,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/templates/$templateId')({
  component: TemplateEditorPage,
})

interface Template {
  id: number
  name: string
  description: string | null
  width: number
  height: number
  template: string
  styles: Record<string, unknown> | null
  variables: string[] | null
  previewUrl: string | null
  isDefault: boolean
  createdAt: string
}

// Sample product data for preview
const DEFAULT_SAMPLE_PRODUCT = {
  productName: 'Premium Wireless Headphones',
  shortDescription: 'Experience crystal-clear audio with our latest noise-canceling technology',
  description: 'These premium wireless headphones feature advanced active noise cancellation, 40-hour battery life, and premium comfort for all-day wear.',
  price: '299.99',
  regularPrice: '349.99',
  salePrice: '299.99',
  category: 'Electronics',
  sku: 'WH-PRO-001',
  stockStatus: 'instock',
  imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop',
}

// Available variables with descriptions
const AVAILABLE_VARIABLES = [
  { name: 'productName', description: 'Product name', example: 'Premium Wireless Headphones' },
  { name: 'shortDescription', description: 'Short description', example: 'Experience crystal-clear audio...' },
  { name: 'description', description: 'Full description', example: 'These premium wireless headphones...' },
  { name: 'price', description: 'Current price', example: '299.99' },
  { name: 'regularPrice', description: 'Regular price', example: '349.99' },
  { name: 'salePrice', description: 'Sale price', example: '299.99' },
  { name: 'category', description: 'Product category', example: 'Electronics' },
  { name: 'sku', description: 'Product SKU', example: 'WH-PRO-001' },
  { name: 'stockStatus', description: 'Stock status', example: 'instock' },
  { name: 'imageUrl', description: 'Product image URL', example: 'https://...' },
]

interface Product {
  id: number
  name: string
  shortDescription: string | null
  description: string | null
  price: string | null
  regularPrice: string | null
  salePrice: string | null
  categories: string[] | null
  sku: string | null
  stockStatus: string | null
  images: { src: string; alt: string }[] | null
}

// Preset templates
const PRESET_TEMPLATES = {
  gradient: `<div style="display: flex; flex-direction: column; width: 100%; height: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 60px;">
  <h1 style="color: white; font-size: 48px; font-weight: bold; margin: 0;">{{productName}}</h1>
  <p style="color: rgba(255,255,255,0.9); font-size: 24px; margin-top: 20px;">{{shortDescription}}</p>
  <div style="margin-top: auto; display: flex; align-items: center; gap: 20px;">
    <span style="color: white; font-size: 36px; font-weight: bold;">\${{price}}</span>
  </div>
</div>`,
  minimal: `<div style="display: flex; flex-direction: column; width: 100%; height: 100%; background: #ffffff; padding: 60px;">
  <h1 style="color: #111827; font-size: 42px; font-weight: 600; margin: 0; letter-spacing: -1px;">{{productName}}</h1>
  <p style="color: #6b7280; font-size: 20px; margin-top: 16px; line-height: 1.5;">{{shortDescription}}</p>
  <div style="margin-top: auto; display: flex; align-items: baseline; gap: 12px;">
    <span style="color: #111827; font-size: 32px; font-weight: 700;">\${{price}}</span>
    <span style="color: #9ca3af; font-size: 18px; text-decoration: line-through;">\${{regularPrice}}</span>
  </div>
</div>`,
  dark: `<div style="display: flex; flex-direction: column; width: 100%; height: 100%; background: #0f172a; padding: 60px;">
  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 20px;">
    <span style="background: #6366f1; color: white; font-size: 14px; padding: 4px 12px; border-radius: 20px;">{{category}}</span>
  </div>
  <h1 style="color: #f1f5f9; font-size: 44px; font-weight: bold; margin: 0;">{{productName}}</h1>
  <p style="color: #94a3b8; font-size: 22px; margin-top: 16px;">{{shortDescription}}</p>
  <div style="margin-top: auto; display: flex; align-items: center; justify-content: space-between;">
    <span style="color: #22c55e; font-size: 36px; font-weight: bold;">\${{price}}</span>
    <span style="color: #64748b; font-size: 14px;">SKU: {{sku}}</span>
  </div>
</div>`,
  sale: `<div style="display: flex; flex-direction: column; width: 100%; height: 100%; background: linear-gradient(180deg, #dc2626 0%, #991b1b 100%); padding: 60px; position: relative;">
  <div style="position: absolute; top: 20px; right: 20px; background: #fef08a; color: #713f12; font-size: 18px; font-weight: bold; padding: 8px 16px; border-radius: 4px; transform: rotate(3deg);">
    SALE!
  </div>
  <h1 style="color: white; font-size: 44px; font-weight: bold; margin: 0;">{{productName}}</h1>
  <p style="color: rgba(255,255,255,0.85); font-size: 20px; margin-top: 16px;">{{shortDescription}}</p>
  <div style="margin-top: auto; display: flex; align-items: baseline; gap: 16px;">
    <span style="color: white; font-size: 42px; font-weight: bold;">\${{salePrice}}</span>
    <span style="color: rgba(255,255,255,0.6); font-size: 24px; text-decoration: line-through;">\${{regularPrice}}</span>
  </div>
</div>`,
  withImage: `<div style="display: flex; width: 100%; height: 100%; background: #ffffff;">
  <div style="width: 50%; height: 100%; overflow: hidden;">
    <img src="{{imageUrl}}" style="width: 100%; height: 100%; object-fit: cover;" />
  </div>
  <div style="width: 50%; padding: 40px; display: flex; flex-direction: column; justify-content: center;">
    <span style="color: #6366f1; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">{{category}}</span>
    <h1 style="color: #111827; font-size: 36px; font-weight: bold; margin: 12px 0 0 0;">{{productName}}</h1>
    <p style="color: #6b7280; font-size: 16px; margin-top: 12px; line-height: 1.6;">{{shortDescription}}</p>
    <div style="margin-top: 24px; display: flex; align-items: baseline; gap: 12px;">
      <span style="color: #111827; font-size: 32px; font-weight: 700;">\${{price}}</span>
    </div>
  </div>
</div>`,
  imageOverlay: `<div style="display: flex; width: 100%; height: 100%; position: relative;">
  <img src="{{imageUrl}}" style="width: 100%; height: 100%; object-fit: cover;" />
  <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 60%);"></div>
  <div style="position: absolute; bottom: 0; left: 0; right: 0; padding: 40px;">
    <h1 style="color: white; font-size: 40px; font-weight: bold; margin: 0; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">{{productName}}</h1>
    <p style="color: rgba(255,255,255,0.9); font-size: 18px; margin-top: 8px;">{{shortDescription}}</p>
    <span style="display: inline-block; margin-top: 16px; color: #22c55e; font-size: 28px; font-weight: bold;">\${{price}}</span>
  </div>
</div>`,
}

function TemplateEditorPage() {
  const { templateId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, isLoading: authLoading } = useAuth()

  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    width: 1200,
    height: 630,
    template: '',
    variables: [] as string[],
    isDefault: false,
  })
  const [hasChanges, setHasChanges] = useState(false)
  const [activeTab, setActiveTab] = useState('editor')
  const [previewScale, setPreviewScale] = useState(0.5)
  const [previewBgColor, setPreviewBgColor] = useState('#1e293b')
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [previewMode, setPreviewMode] = useState<'satori' | 'html'>('satori')
  const [satoriSvg, setSatoriSvg] = useState<string | null>(null)
  const [satoriError, setSatoriError] = useState<string | null>(null)
  const [isGeneratingSatori, setIsGeneratingSatori] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: '/auth/login' })
    }
  }, [user, authLoading, navigate])

  // Fetch products for demo selection
  const { data: productsData } = useQuery({
    queryKey: ['products-for-template', productSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '20',
        excludeVariations: 'true',
      })
      if (productSearch) {
        params.set('search', productSearch)
      }
      const res = await fetch(`/api/products/?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch products')
      return res.json()
    },
    enabled: !!user,
  })

  const products: Product[] = productsData?.products || []

  // Fetch template
  const { data: templateData, isLoading: templateLoading } = useQuery({
    queryKey: ['template', templateId],
    queryFn: async () => {
      const res = await fetch('/api/templates/', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch templates')
      const data = await res.json()
      const template = data.templates?.find((t: Template) => t.id === parseInt(templateId))
      if (!template) throw new Error('Template not found')
      return template
    },
    enabled: !!user && !!templateId,
  })

  // Initialize form when template loads
  useEffect(() => {
    if (templateData) {
      setEditForm({
        name: templateData.name,
        description: templateData.description || '',
        width: templateData.width,
        height: templateData.height,
        template: templateData.template,
        variables: templateData.variables || [],
        isDefault: templateData.isDefault,
      })
    }
  }, [templateData])

  // Track changes
  useEffect(() => {
    if (!templateData) return
    const changed =
      editForm.name !== templateData.name ||
      editForm.description !== (templateData.description || '') ||
      editForm.width !== templateData.width ||
      editForm.height !== templateData.height ||
      editForm.template !== templateData.template ||
      editForm.isDefault !== templateData.isDefault
    setHasChanges(changed)
  }, [editForm, templateData])

  // Update template mutation
  const updateMutation = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const res = await fetch('/api/templates/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: parseInt(templateId), ...data }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update template')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Template saved')
      queryClient.invalidateQueries({ queryKey: ['template', templateId] })
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setHasChanges(false)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Render preview with sample data
  // Get current preview product data
  const selectedProduct = selectedProductId ? products.find(p => p.id === selectedProductId) : null
  
  const previewProductData = useMemo(() => {
    if (selectedProduct) {
      return {
        productName: selectedProduct.name,
        shortDescription: selectedProduct.shortDescription || '',
        description: selectedProduct.description || '',
        price: selectedProduct.price || '0.00',
        regularPrice: selectedProduct.regularPrice || selectedProduct.price || '0.00',
        salePrice: selectedProduct.salePrice || selectedProduct.price || '0.00',
        category: selectedProduct.categories?.[0] || 'Uncategorized',
        sku: selectedProduct.sku || '',
        stockStatus: selectedProduct.stockStatus || 'instock',
        imageUrl: selectedProduct.images?.[0]?.src || 'https://via.placeholder.com/400x400?text=No+Image',
      }
    }
    return DEFAULT_SAMPLE_PRODUCT
  }, [selectedProduct])

  const renderedPreview = useMemo(() => {
    let html = editForm.template
    Object.entries(previewProductData).forEach(([key, value]) => {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), value)
    })
    return html
  }, [editForm.template, previewProductData])

  // Generate Satori preview
  const generateSatoriPreview = async () => {
    if (!editForm.template) return
    
    setIsGeneratingSatori(true)
    setSatoriError(null)
    
    try {
      const res = await fetch('/api/templates/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          template: editForm.template,
          width: editForm.width,
          height: editForm.height,
          productData: previewProductData,
        }),
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate preview')
      }
      
      setSatoriSvg(data.svg)
    } catch (error: any) {
      setSatoriError(error.message)
      setSatoriSvg(null)
    } finally {
      setIsGeneratingSatori(false)
    }
  }

  // Auto-generate Satori preview when template or product changes (debounced)
  useEffect(() => {
    if (previewMode !== 'satori') return
    if (!editForm.template) return
    
    const abortController = new AbortController()
    
    const timeout = setTimeout(async () => {
      setIsGeneratingSatori(true)
      setSatoriError(null)
      
      try {
        const res = await fetch('/api/templates/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            template: editForm.template,
            width: editForm.width,
            height: editForm.height,
            productData: previewProductData,
          }),
          signal: abortController.signal,
        })
        
        const data = await res.json()
        
        if (!res.ok) {
          throw new Error(data.error || 'Failed to generate preview')
        }
        
        setSatoriSvg(data.svg)
        setSatoriError(null)
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          setSatoriError(error.message)
          setSatoriSvg(null)
        }
      } finally {
        setIsGeneratingSatori(false)
      }
    }, 800) // Debounce 800ms
    
    return () => {
      clearTimeout(timeout)
      abortController.abort()
    }
  }, [editForm.template, editForm.width, editForm.height, previewProductData, previewMode])

  // Extract variables from template
  const extractVariables = () => {
    const matches = editForm.template.match(/\{\{(\w+)\}\}/g) || []
    const vars = [...new Set(matches.map((m) => m.replace(/[{}]/g, '')))]
    setEditForm({ ...editForm, variables: vars })
    toast.success(`Found ${vars.length} variables`)
  }

  // Apply preset template
  const applyPreset = (presetKey: keyof typeof PRESET_TEMPLATES) => {
    setEditForm({ ...editForm, template: PRESET_TEMPLATES[presetKey] })
    toast.success('Preset applied')
  }

  // Insert variable at cursor
  const insertVariable = (varName: string) => {
    const textarea = document.getElementById('template-editor') as HTMLTextAreaElement
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const text = editForm.template
      const newText = text.substring(0, start) + `{{${varName}}}` + text.substring(end)
      setEditForm({ ...editForm, template: newText })
      // Restore cursor position
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + varName.length + 4, start + varName.length + 4)
      }, 0)
    }
  }

  if (authLoading || templateLoading) {
    return (
      <div className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (!templateData) {
    return (
      <div className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-slate-100 mb-2">Template not found</h2>
          <Link to="/templates">
            <Button variant="outline" className="border-slate-700 text-slate-300">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Templates
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <div className="max-w-[1800px] mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link to="/templates">
              <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-100 hover:bg-slate-800">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-100">{editForm.name}</h1>
                {editForm.isDefault && (
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
                    <Star className="h-3 w-3 mr-1 fill-current" />
                    Default
                  </Badge>
                )}
              </div>
              <p className="text-sm text-slate-400">
                {editForm.width} × {editForm.height} • {editForm.variables.length} variables
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={extractVariables}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Extract Variables
            </Button>
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

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Editor */}
          <div className="space-y-4">
            {/* Settings Card */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Settings2 className="h-5 w-5" />
                  Template Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Name</Label>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="bg-slate-800 border-slate-700 text-slate-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Dimensions</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={editForm.width}
                        onChange={(e) => setEditForm({ ...editForm, width: parseInt(e.target.value) || 1200 })}
                        className="bg-slate-800 border-slate-700 text-slate-100"
                      />
                      <span className="text-slate-500 flex items-center">×</span>
                      <Input
                        type="number"
                        value={editForm.height}
                        onChange={(e) => setEditForm({ ...editForm, height: parseInt(e.target.value) || 630 })}
                        className="bg-slate-800 border-slate-700 text-slate-100"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">Description</Label>
                  <Input
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="bg-slate-800 border-slate-700 text-slate-100"
                    placeholder="Template description..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editForm.isDefault}
                    onCheckedChange={(checked) => setEditForm({ ...editForm, isDefault: checked })}
                  />
                  <Label className="text-slate-300">Set as default template</Label>
                </div>
              </CardContent>
            </Card>

            {/* Editor Card */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-slate-100 flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    Template Code
                  </CardTitle>
                  <Select onValueChange={(v) => applyPreset(v as keyof typeof PRESET_TEMPLATES)}>
                    <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-sm">
                      <Palette className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Presets" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800">
                      <SelectItem value="gradient" className="text-slate-300">Gradient</SelectItem>
                      <SelectItem value="minimal" className="text-slate-300">Minimal</SelectItem>
                      <SelectItem value="dark" className="text-slate-300">Dark</SelectItem>
                      <SelectItem value="sale" className="text-slate-300">Sale Banner</SelectItem>
                      <SelectItem value="withImage" className="text-slate-300">
                        <span className="flex items-center gap-1">
                          <ImageIcon className="h-3 w-3" /> Split Image
                        </span>
                      </SelectItem>
                      <SelectItem value="imageOverlay" className="text-slate-300">
                        <span className="flex items-center gap-1">
                          <ImageIcon className="h-3 w-3" /> Image Overlay
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  id="template-editor"
                  value={editForm.template}
                  onChange={(e) => setEditForm({ ...editForm, template: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-slate-100 font-mono text-sm min-h-[400px]"
                  placeholder="<div>...</div>"
                />
              </CardContent>
            </Card>

            {/* Variables Card */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-slate-100 flex items-center gap-2">
                  <Type className="h-5 w-5" />
                  Available Variables
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_VARIABLES.map((v) => (
                    <button
                      key={v.name}
                      onClick={() => insertVariable(v.name)}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors text-left"
                    >
                      <div>
                        <code className="text-indigo-400 text-sm">{`{{${v.name}}}`}</code>
                        <p className="text-xs text-slate-500 mt-0.5">{v.description}</p>
                      </div>
                      <Copy className="h-3 w-3 text-slate-500" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Preview */}
          <div className="space-y-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-slate-100 flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    Live Preview
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    {/* Preview Mode Toggle */}
                    <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
                      <button
                        onClick={() => setPreviewMode('satori')}
                        className={`px-2 py-1 text-xs rounded-md transition-colors ${
                          previewMode === 'satori'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Satori (SVG)
                      </button>
                      <button
                        onClick={() => setPreviewMode('html')}
                        className={`px-2 py-1 text-xs rounded-md transition-colors ${
                          previewMode === 'html'
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        HTML
                      </button>
                    </div>
                    <Label className="text-slate-400 text-sm">Scale:</Label>
                    <Select value={previewScale.toString()} onValueChange={(v) => setPreviewScale(parseFloat(v))}>
                      <SelectTrigger className="w-20 bg-slate-800 border-slate-700 text-sm h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800">
                        <SelectItem value="0.25" className="text-slate-300">25%</SelectItem>
                        <SelectItem value="0.5" className="text-slate-300">50%</SelectItem>
                        <SelectItem value="0.75" className="text-slate-300">75%</SelectItem>
                        <SelectItem value="1" className="text-slate-300">100%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Preview Controls */}
                <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                  {/* Background Color Picker */}
                  <div className="flex items-center gap-2">
                    <Label className="text-slate-400 text-sm whitespace-nowrap">Background:</Label>
                    <div className="flex items-center gap-1">
                      <input
                        type="color"
                        value={previewBgColor}
                        onChange={(e) => setPreviewBgColor(e.target.value)}
                        className="w-8 h-8 rounded cursor-pointer border border-slate-600"
                      />
                      <Input
                        value={previewBgColor}
                        onChange={(e) => setPreviewBgColor(e.target.value)}
                        className="w-24 h-8 bg-slate-800 border-slate-700 text-slate-100 text-xs font-mono"
                        placeholder="#000000"
                      />
                    </div>
                  </div>

                  {/* Product Selector */}
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <Label className="text-slate-400 text-sm whitespace-nowrap">
                      <Package className="h-4 w-4 inline mr-1" />
                      Demo:
                    </Label>
                    <Select
                      value={selectedProductId?.toString() || 'sample'}
                      onValueChange={(v) => setSelectedProductId(v === 'sample' ? null : parseInt(v))}
                    >
                      <SelectTrigger className="flex-1 bg-slate-800 border-slate-700 text-sm h-8">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800 max-h-60">
                        <SelectItem value="sample" className="text-slate-300">
                          <span className="flex items-center gap-2">
                            <span className="text-amber-400">★</span> Sample Product
                          </span>
                        </SelectItem>
                        {products.length > 0 && (
                          <div className="border-t border-slate-800 my-1" />
                        )}
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()} className="text-slate-300">
                            <span className="flex items-center gap-2">
                              {p.images?.[0]?.src ? (
                                <img src={p.images[0].src} className="w-5 h-5 rounded object-cover" alt="" />
                              ) : (
                                <Package className="w-5 h-5 text-slate-500" />
                              )}
                              <span className="truncate max-w-[180px]">{p.name}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Preview Area */}
                <div 
                  className="rounded-lg p-4 overflow-auto transition-colors relative" 
                  style={{ maxHeight: '500px', backgroundColor: previewBgColor }}
                >
                  {/* Loading overlay for Satori */}
                  {previewMode === 'satori' && isGeneratingSatori && (
                    <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center z-10 rounded-lg">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm">Generating Satori preview...</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Satori Error */}
                  {previewMode === 'satori' && satoriError && (
                    <div className="mb-3 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
                      <strong>Satori Error:</strong> {satoriError}
                      <p className="text-xs text-red-400 mt-1">
                        Switch to HTML mode to see browser rendering, or fix the template.
                      </p>
                    </div>
                  )}

                  <div
                    style={{
                      width: editForm.width * previewScale,
                      height: editForm.height * previewScale,
                      transform: `scale(${previewScale})`,
                      transformOrigin: 'top left',
                      overflow: 'hidden',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    {previewMode === 'satori' ? (
                      satoriSvg ? (
                        <div
                          style={{ width: editForm.width, height: editForm.height }}
                          dangerouslySetInnerHTML={{ __html: satoriSvg }}
                        />
                      ) : !isGeneratingSatori && !satoriError ? (
                        <div 
                          style={{ width: editForm.width, height: editForm.height }}
                          className="bg-slate-800 flex items-center justify-center"
                        >
                          <span className="text-slate-500 text-sm">Click to generate preview</span>
                        </div>
                      ) : null
                    ) : (
                      <div
                        style={{ width: editForm.width, height: editForm.height }}
                        dangerouslySetInnerHTML={{ __html: renderedPreview }}
                      />
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    {selectedProduct ? (
                      <>Previewing with: <span className="text-indigo-400">{selectedProduct.name}</span></>
                    ) : (
                      'Using sample product data. Select a real product to preview with actual data.'
                    )}
                  </p>
                  {previewMode === 'satori' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={generateSatoriPreview}
                      disabled={isGeneratingSatori}
                      className="text-xs text-slate-400 hover:text-slate-200 h-6"
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${isGeneratingSatori ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  )}
                </div>
                {previewMode === 'html' && (
                  <p className="text-xs text-amber-500 mt-1">
                    ⚠️ HTML mode shows browser rendering which may differ from actual Satori output.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Sample Data Card */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-slate-100 text-sm flex items-center gap-2">
                  Preview Data
                  {selectedProduct && (
                    <Badge className="text-xs bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
                      Real Product
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {Object.entries(previewProductData).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-slate-500">{key}:</span>
                      <span className="text-slate-300 truncate ml-2 max-w-[200px]">
                        {key === 'imageUrl' ? (
                          <a href={value} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">
                            {value.substring(0, 30)}...
                          </a>
                        ) : (
                          String(value).substring(0, 50) + (String(value).length > 50 ? '...' : '')
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Detected Variables */}
            {editForm.variables.length > 0 && (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-slate-100 text-sm">Detected Variables ({editForm.variables.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {editForm.variables.map((v, i) => (
                      <Badge key={i} variant="outline" className="bg-slate-800 text-indigo-300 border-indigo-500/30">
                        {`{{${v}}}`}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
