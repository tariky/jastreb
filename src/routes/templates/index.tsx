import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  Layout,
  ListFilter,
  Star,
  Copy,
  Eye,
  Settings2,
  Zap,
  Package,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/templates/')({
  component: TemplatesPage,
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

interface TemplateRule {
  id: number
  templateId: number
  templateName?: string
  name: string
  description: string | null
  priority: number
  isActive: boolean
  conditions: {
    categories?: string[]
    tags?: string[]
    priceMin?: number
    priceMax?: number
    stockStatus?: string[]
    productType?: string[]
    skuPattern?: string
    namePattern?: string
  } | null
  createdAt: string
}

function TemplatesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user, isLoading: authLoading } = useAuth()

  const [activeTab, setActiveTab] = useState('templates')
  const [showNewTemplateDialog, setShowNewTemplateDialog] = useState(false)
  const [showNewRuleDialog, setShowNewRuleDialog] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null)
  const [editingRule, setEditingRule] = useState<TemplateRule | null>(null)

  // New template form state
  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    width: 1200,
    height: 630,
    template: `<div style="display: flex; flex-direction: column; width: 100%; height: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 60px;">
  <h1 style="color: white; font-size: 48px; font-weight: bold; margin: 0;">{{productName}}</h1>
  <p style="color: rgba(255,255,255,0.9); font-size: 24px; margin-top: 20px;">{{shortDescription}}</p>
  <div style="margin-top: auto; display: flex; align-items: center; gap: 20px;">
    <span style="color: white; font-size: 36px; font-weight: bold;">\${{price}}</span>
  </div>
</div>`,
    variables: ['productName', 'shortDescription', 'price', 'regularPrice', 'category'],
    isDefault: false,
  })

  // New rule form state
  const [ruleForm, setRuleForm] = useState({
    templateId: 0,
    name: '',
    description: '',
    priority: 0,
    isActive: true,
    conditions: {
      categories: [] as string[],
      tags: [] as string[],
      priceMin: undefined as number | undefined,
      priceMax: undefined as number | undefined,
      stockStatus: [] as string[],
      productType: [] as string[],
      skuPattern: '',
      namePattern: '',
    },
  })

  // Rule preview state
  const [rulePreview, setRulePreview] = useState<{
    total: number
    totalProducts: number
    products: Array<{
      id: number
      name: string
      sku: string | null
      price: string | null
      stockStatus: string | null
      productType: string | null
      categories: string[] | null
      image: string | null
    }>
  } | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: '/auth/login' })
    }
  }, [user, authLoading, navigate])

  // Fetch templates
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const res = await fetch('/api/templates/', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch templates')
      return res.json()
    },
    enabled: !!user,
  })

  // Fetch rules
  const { data: rulesData, isLoading: rulesLoading } = useQuery({
    queryKey: ['template-rules'],
    queryFn: async () => {
      const res = await fetch('/api/templates/rules', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch rules')
      return res.json()
    },
    enabled: !!user,
  })

  const templates: Template[] = templatesData?.templates || []
  const rules: TemplateRule[] = rulesData?.rules || []

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (data: typeof templateForm) => {
      const res = await fetch('/api/templates/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create template')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Template created')
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setShowNewTemplateDialog(false)
      resetTemplateForm()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async (data: Partial<Template> & { id: number }) => {
      const res = await fetch('/api/templates/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update template')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Template updated')
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      setEditingTemplate(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/templates/?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete template')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Template deleted')
      queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Create rule mutation
  const createRuleMutation = useMutation({
    mutationFn: async (data: typeof ruleForm) => {
      const res = await fetch('/api/templates/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...data,
          conditions: {
            ...data.conditions,
            categories: data.conditions.categories.length ? data.conditions.categories : undefined,
            tags: data.conditions.tags.length ? data.conditions.tags : undefined,
            stockStatus: data.conditions.stockStatus.length ? data.conditions.stockStatus : undefined,
            productType: data.conditions.productType.length ? data.conditions.productType : undefined,
            skuPattern: data.conditions.skuPattern || undefined,
            namePattern: data.conditions.namePattern || undefined,
          },
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create rule')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Rule created')
      queryClient.invalidateQueries({ queryKey: ['template-rules'] })
      setShowNewRuleDialog(false)
      resetRuleForm()
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Update rule mutation
  const updateRuleMutation = useMutation({
    mutationFn: async (data: Partial<TemplateRule> & { id: number }) => {
      const res = await fetch('/api/templates/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update rule')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Rule updated')
      queryClient.invalidateQueries({ queryKey: ['template-rules'] })
      setEditingRule(null)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Delete rule mutation
  const deleteRuleMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/templates/rules?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete rule')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Rule deleted')
      queryClient.invalidateQueries({ queryKey: ['template-rules'] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const resetTemplateForm = () => {
    setTemplateForm({
      name: '',
      description: '',
      width: 1200,
      height: 630,
      template: `<div style="display: flex; flex-direction: column; width: 100%; height: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 60px;">
  <h1 style="color: white; font-size: 48px; font-weight: bold; margin: 0;">{{productName}}</h1>
  <p style="color: rgba(255,255,255,0.9); font-size: 24px; margin-top: 20px;">{{shortDescription}}</p>
  <div style="margin-top: auto; display: flex; align-items: center; gap: 20px;">
    <span style="color: white; font-size: 36px; font-weight: bold;">\${{price}}</span>
  </div>
</div>`,
      variables: ['productName', 'shortDescription', 'price', 'regularPrice', 'category'],
      isDefault: false,
    })
  }

  const resetRuleForm = () => {
    setRuleForm({
      templateId: 0,
      name: '',
      description: '',
      priority: 0,
      isActive: true,
      conditions: {
        categories: [],
        tags: [],
        priceMin: undefined,
        priceMax: undefined,
        stockStatus: [],
        productType: [],
        skuPattern: '',
        namePattern: '',
      },
    })
    setRulePreview(null)
  }

  // Fetch preview of products matching rule conditions
  const fetchRulePreview = async () => {
    // Clean up conditions - remove empty arrays and undefined values
    const cleanConditions = {
      ...(ruleForm.conditions.categories.length > 0 && { categories: ruleForm.conditions.categories }),
      ...(ruleForm.conditions.tags.length > 0 && { tags: ruleForm.conditions.tags }),
      ...(ruleForm.conditions.priceMin !== undefined && { priceMin: ruleForm.conditions.priceMin }),
      ...(ruleForm.conditions.priceMax !== undefined && { priceMax: ruleForm.conditions.priceMax }),
      ...(ruleForm.conditions.stockStatus.length > 0 && { stockStatus: ruleForm.conditions.stockStatus }),
      ...(ruleForm.conditions.productType.length > 0 && { productType: ruleForm.conditions.productType }),
      ...(ruleForm.conditions.skuPattern && { skuPattern: ruleForm.conditions.skuPattern }),
      ...(ruleForm.conditions.namePattern && { namePattern: ruleForm.conditions.namePattern }),
    }

    // Don't fetch if no conditions set
    if (Object.keys(cleanConditions).length === 0) {
      setRulePreview(null)
      toast.info('Add at least one condition to preview matching products')
      return
    }

    setIsLoadingPreview(true)
    try {
      const res = await fetch('/api/templates/rules-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ conditions: cleanConditions, limit: 10 }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to preview')
      }

      const data = await res.json()
      setRulePreview(data)
    } catch (error: any) {
      toast.error(error.message)
      setRulePreview(null)
    } finally {
      setIsLoadingPreview(false)
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
    <div className="min-h-[calc(100dvh-3.5rem)] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-100">Templates</h1>
            <p className="text-slate-400 mt-1">Design and manage image templates for your products</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex items-center justify-between">
            <TabsList className="bg-slate-800/50 border border-slate-700">
              <TabsTrigger value="templates" className="data-[state=active]:bg-indigo-600">
                <Layout className="h-4 w-4 mr-2" />
                Templates ({templates.length})
              </TabsTrigger>
              <TabsTrigger value="rules" className="data-[state=active]:bg-indigo-600">
                <ListFilter className="h-4 w-4 mr-2" />
                Rules ({rules.length})
              </TabsTrigger>
            </TabsList>

            <div className="flex gap-2">
              {activeTab === 'templates' && (
                <Button
                  onClick={() => setShowNewTemplateDialog(true)}
                  className="bg-indigo-600 hover:bg-indigo-500"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Template
                </Button>
              )}
              {activeTab === 'rules' && (
                <Button
                  onClick={() => setShowNewRuleDialog(true)}
                  className="bg-indigo-600 hover:bg-indigo-500"
                  disabled={templates.length === 0}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Rule
                </Button>
              )}
            </div>
          </div>

          {/* Templates Tab */}
          <TabsContent value="templates">
            {templatesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
              </div>
            ) : templates.length === 0 ? (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Layout className="h-12 w-12 text-slate-600 mb-4" />
                  <h3 className="text-lg font-medium text-slate-300 mb-2">No templates yet</h3>
                  <p className="text-slate-500 text-center mb-4">
                    Create your first template to start generating product images
                  </p>
                  <Button
                    onClick={() => setShowNewTemplateDialog(true)}
                    className="bg-indigo-600 hover:bg-indigo-500"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Template
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <Card key={template.id} className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-slate-100 truncate">{template.name}</CardTitle>
                            {template.isDefault && (
                              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 shrink-0">
                                <Star className="h-3 w-3 mr-1 fill-current" />
                                Default
                              </Badge>
                            )}
                          </div>
                          {template.description && (
                            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{template.description}</p>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800">
                            <DropdownMenuItem
                              onClick={() => navigate({ to: '/templates/$templateId', params: { templateId: template.id.toString() } })}
                              className="text-slate-300 focus:bg-slate-800"
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setTemplateForm({
                                  name: `${template.name} (Copy)`,
                                  description: template.description || '',
                                  width: template.width,
                                  height: template.height,
                                  template: template.template,
                                  variables: template.variables || [],
                                  isDefault: false,
                                })
                                setShowNewTemplateDialog(true)
                              }}
                              className="text-slate-300 focus:bg-slate-800"
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => updateTemplateMutation.mutate({ id: template.id, isDefault: !template.isDefault })}
                              className="text-slate-300 focus:bg-slate-800"
                            >
                              <Star className="h-4 w-4 mr-2" />
                              {template.isDefault ? 'Remove Default' : 'Set as Default'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-slate-800" />
                            <DropdownMenuItem
                              onClick={() => {
                                if (confirm('Delete this template?')) {
                                  deleteTemplateMutation.mutate(template.id)
                                }
                              }}
                              className="text-red-400 focus:bg-red-500/10"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <span>{template.width} × {template.height}</span>
                          <span>•</span>
                          <span>{template.variables?.length || 0} variables</span>
                        </div>
                        {template.variables && template.variables.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {template.variables.slice(0, 4).map((v, i) => (
                              <Badge key={i} variant="outline" className="text-xs bg-slate-800 text-slate-400 border-slate-700">
                                {`{{${v}}}`}
                              </Badge>
                            ))}
                            {template.variables.length > 4 && (
                              <Badge variant="outline" className="text-xs bg-slate-800 text-slate-400 border-slate-700">
                                +{template.variables.length - 4} more
                              </Badge>
                            )}
                          </div>
                        )}
                        <Button
                          variant="outline"
                          className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                          onClick={() => navigate({ to: '/templates/$templateId', params: { templateId: template.id.toString() } })}
                        >
                          <Settings2 className="h-4 w-4 mr-2" />
                          Open Designer
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Rules Tab */}
          <TabsContent value="rules">
            {rulesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
              </div>
            ) : rules.length === 0 ? (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <ListFilter className="h-12 w-12 text-slate-600 mb-4" />
                  <h3 className="text-lg font-medium text-slate-300 mb-2">No rules yet</h3>
                  <p className="text-slate-500 text-center mb-4">
                    Create rules to automatically assign templates to products based on conditions
                  </p>
                  {templates.length > 0 ? (
                    <Button
                      onClick={() => setShowNewRuleDialog(true)}
                      className="bg-indigo-600 hover:bg-indigo-500"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Rule
                    </Button>
                  ) : (
                    <p className="text-slate-500 text-sm">Create a template first to add rules</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <Card key={rule.id} className="bg-slate-900/50 border-slate-800">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-2 h-12 rounded-full ${rule.isActive ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-slate-100">{rule.name}</h3>
                              <Badge variant="outline" className="text-xs bg-slate-800 text-slate-400 border-slate-700">
                                Priority: {rule.priority}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-500 mt-0.5">
                              Template: <span className="text-indigo-400">{rule.templateName || 'Unknown'}</span>
                            </p>
                            {rule.conditions && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {rule.conditions.categories?.length && (
                                  <Badge className="text-xs bg-blue-500/20 text-blue-300 border-blue-500/30">
                                    Categories: {rule.conditions.categories.join(', ')}
                                  </Badge>
                                )}
                                {rule.conditions.tags?.length && (
                                  <Badge className="text-xs bg-purple-500/20 text-purple-300 border-purple-500/30">
                                    Tags: {rule.conditions.tags.join(', ')}
                                  </Badge>
                                )}
                                {(rule.conditions.priceMin !== undefined || rule.conditions.priceMax !== undefined) && (
                                  <Badge className="text-xs bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                                    Price: ${rule.conditions.priceMin || 0} - ${rule.conditions.priceMax || '∞'}
                                  </Badge>
                                )}
                                {rule.conditions.stockStatus?.length && (
                                  <Badge className="text-xs bg-amber-500/20 text-amber-300 border-amber-500/30">
                                    Stock: {rule.conditions.stockStatus.join(', ')}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={rule.isActive}
                            onCheckedChange={(checked) => updateRuleMutation.mutate({ id: rule.id, isActive: checked })}
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800">
                              <DropdownMenuItem
                                onClick={() => setEditingRule(rule)}
                                className="text-slate-300 focus:bg-slate-800"
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-slate-800" />
                              <DropdownMenuItem
                                onClick={() => {
                                  if (confirm('Delete this rule?')) {
                                    deleteRuleMutation.mutate(rule.id)
                                  }
                                }}
                                className="text-red-400 focus:bg-red-500/10"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* New Template Dialog */}
      <Dialog open={showNewTemplateDialog} onOpenChange={setShowNewTemplateDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Create New Template</DialogTitle>
            <DialogDescription className="text-slate-400">
              Design a new image template for your products
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Name *</Label>
                <Input
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                  placeholder="Product Banner"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Dimensions</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={templateForm.width}
                    onChange={(e) => setTemplateForm({ ...templateForm, width: parseInt(e.target.value) || 1200 })}
                    className="bg-slate-800 border-slate-700 text-slate-100"
                    placeholder="Width"
                  />
                  <span className="text-slate-500 flex items-center">×</span>
                  <Input
                    type="number"
                    value={templateForm.height}
                    onChange={(e) => setTemplateForm({ ...templateForm, height: parseInt(e.target.value) || 630 })}
                    className="bg-slate-800 border-slate-700 text-slate-100"
                    placeholder="Height"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Description</Label>
              <Input
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                className="bg-slate-800 border-slate-700 text-slate-100"
                placeholder="Template for social media product banners"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-300">Template HTML *</Label>
              <Textarea
                value={templateForm.template}
                onChange={(e) => setTemplateForm({ ...templateForm, template: e.target.value })}
                className="bg-slate-800 border-slate-700 text-slate-100 min-h-[200px] font-mono text-sm"
                placeholder="<div>...</div>"
              />
              <p className="text-xs text-slate-500">
                Use {`{{variableName}}`} for dynamic content. Available: productName, shortDescription, price, regularPrice, category, sku
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={templateForm.isDefault}
                onCheckedChange={(checked) => setTemplateForm({ ...templateForm, isDefault: checked })}
              />
              <Label className="text-slate-300">Set as default template</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewTemplateDialog(false)
                resetTemplateForm()
              }}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createTemplateMutation.mutate(templateForm)}
              disabled={!templateForm.name || !templateForm.template || createTemplateMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-500"
            >
              {createTemplateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Rule Dialog */}
      <Dialog open={showNewRuleDialog} onOpenChange={setShowNewRuleDialog}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Create New Rule</DialogTitle>
            <DialogDescription className="text-slate-400">
              Define conditions to auto-assign templates to products
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Rule Name *</Label>
                <Input
                  value={ruleForm.name}
                  onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                  placeholder="Premium Products"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Template *</Label>
                <Select
                  value={ruleForm.templateId.toString()}
                  onValueChange={(v) => setRuleForm({ ...ruleForm, templateId: parseInt(v) })}
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-slate-100">
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800">
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()} className="text-slate-300">
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Priority</Label>
                <Input
                  type="number"
                  value={ruleForm.priority}
                  onChange={(e) => setRuleForm({ ...ruleForm, priority: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                  placeholder="0"
                />
                <p className="text-xs text-slate-500">Higher priority rules are checked first</p>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Description</Label>
                <Input
                  value={ruleForm.description}
                  onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                  className="bg-slate-800 border-slate-700 text-slate-100"
                  placeholder="Apply to premium products"
                />
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4">
              <h4 className="text-sm font-medium text-slate-300 mb-3">Conditions (all must match)</h4>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-400 text-sm">Categories (comma-separated)</Label>
                  <Input
                    value={ruleForm.conditions.categories.join(', ')}
                    onChange={(e) => setRuleForm({
                      ...ruleForm,
                      conditions: {
                        ...ruleForm.conditions,
                        categories: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      },
                    })}
                    className="bg-slate-800 border-slate-700 text-slate-100"
                    placeholder="Electronics, Accessories"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-400 text-sm">Tags (comma-separated)</Label>
                  <Input
                    value={ruleForm.conditions.tags.join(', ')}
                    onChange={(e) => setRuleForm({
                      ...ruleForm,
                      conditions: {
                        ...ruleForm.conditions,
                        tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      },
                    })}
                    className="bg-slate-800 border-slate-700 text-slate-100"
                    placeholder="featured, sale"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-sm">Min Price</Label>
                    <Input
                      type="number"
                      value={ruleForm.conditions.priceMin || ''}
                      onChange={(e) => setRuleForm({
                        ...ruleForm,
                        conditions: {
                          ...ruleForm.conditions,
                          priceMin: e.target.value ? parseFloat(e.target.value) : undefined,
                        },
                      })}
                      className="bg-slate-800 border-slate-700 text-slate-100"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-400 text-sm">Max Price</Label>
                    <Input
                      type="number"
                      value={ruleForm.conditions.priceMax || ''}
                      onChange={(e) => setRuleForm({
                        ...ruleForm,
                        conditions: {
                          ...ruleForm.conditions,
                          priceMax: e.target.value ? parseFloat(e.target.value) : undefined,
                        },
                      })}
                      className="bg-slate-800 border-slate-700 text-slate-100"
                      placeholder="∞"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-400 text-sm">Name Pattern (regex)</Label>
                  <Input
                    value={ruleForm.conditions.namePattern}
                    onChange={(e) => setRuleForm({
                      ...ruleForm,
                      conditions: { ...ruleForm.conditions, namePattern: e.target.value },
                    })}
                    className="bg-slate-800 border-slate-700 text-slate-100"
                    placeholder=".*Premium.*"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={ruleForm.isActive}
                onCheckedChange={(checked) => setRuleForm({ ...ruleForm, isActive: checked })}
              />
              <Label className="text-slate-300">Rule is active</Label>
            </div>

            {/* Preview Section */}
            <div className="border-t border-slate-800 pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Preview Matching Products
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchRulePreview}
                  disabled={isLoadingPreview}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 h-8"
                >
                  {isLoadingPreview ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-1" />
                  )}
                  Test Rule
                </Button>
              </div>

              {rulePreview ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge className={`${rulePreview.total > 0 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>
                      {rulePreview.total} of {rulePreview.totalProducts} products match
                    </Badge>
                    {rulePreview.total === 0 && (
                      <span className="text-xs text-slate-500">Adjust conditions to match products</span>
                    )}
                  </div>

                  {rulePreview.products.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {rulePreview.products.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50"
                        >
                          <div className="w-10 h-10 rounded-md overflow-hidden bg-slate-700 flex items-center justify-center shrink-0">
                            {product.image ? (
                              <img src={product.image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Package className="h-5 w-5 text-slate-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-200 truncate">{product.name}</p>
                            <p className="text-xs text-slate-500">
                              {product.sku && <span>SKU: {product.sku} • </span>}
                              ${product.price || '0.00'}
                              {product.categories?.length ? ` • ${product.categories[0]}` : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                      {rulePreview.total > rulePreview.products.length && (
                        <p className="text-xs text-slate-500 text-center py-1">
                          +{rulePreview.total - rulePreview.products.length} more products
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">
                  Click "Test Rule" to see which products match these conditions
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewRuleDialog(false)
                resetRuleForm()
              }}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={() => createRuleMutation.mutate(ruleForm)}
              disabled={!ruleForm.name || !ruleForm.templateId || createRuleMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-500"
            >
              {createRuleMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Create Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
