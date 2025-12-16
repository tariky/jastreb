import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Sparkles,
  ImagePlus,
  ShoppingBag,
  FileSpreadsheet,
  LayoutTemplate,
  ArrowRight,
  Loader2,
  Zap,
  Layers,
  Download,
} from 'lucide-react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()

  // Show landing page for non-authenticated users
  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  if (!user) {
    return <LandingPage />
  }

  return <Dashboard />
}

function LandingPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 relative overflow-hidden">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      {/* Hero Section */}
      <section className="relative z-10 pt-20 pb-32 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm mb-8">
            <Zap className="h-4 w-4" />
            Powered by Google Gemini AI
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              AI-Powered
            </span>
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Marketing Assets
            </span>
          </h1>
          
          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
            Generate stunning product images, create dynamic templates, and export
            Facebook Commerce feeds — all from one powerful platform.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth/register">
              <Button size="lg" className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-lg px-8 h-14 shadow-lg shadow-indigo-500/25">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/auth/login">
              <Button size="lg" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 text-lg px-8 h-14">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 pb-32 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4 text-slate-100">
            Everything You Need
          </h2>
          <p className="text-slate-400 text-center mb-12 max-w-2xl mx-auto">
            A complete toolkit for creating and managing your product marketing assets
          </p>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard
              icon={ImagePlus}
              title="AI Image Generation"
              description="Create stunning product images with Gemini AI. Multi-turn conversations for iterative refinement."
              gradient="from-indigo-500 to-blue-500"
            />
            <FeatureCard
              icon={ShoppingBag}
              title="WooCommerce Sync"
              description="Automatically import and sync products from your WooCommerce store."
              gradient="from-purple-500 to-pink-500"
            />
            <FeatureCard
              icon={LayoutTemplate}
              title="Satori Templates"
              description="Design reusable image templates with dynamic product data injection."
              gradient="from-cyan-500 to-teal-500"
            />
            <FeatureCard
              icon={FileSpreadsheet}
              title="Feed Export"
              description="Generate Facebook Commerce catalog feeds in CSV format with one click."
              gradient="from-orange-500 to-amber-500"
            />
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="relative z-10 pb-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-indigo-400 mb-2">4K</div>
              <div className="text-slate-500 text-sm">Max Resolution</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-purple-400 mb-2">14</div>
              <div className="text-slate-500 text-sm">Reference Images</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-cyan-400 mb-2">∞</div>
              <div className="text-slate-500 text-sm">Templates</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  gradient,
}: {
  icon: React.ElementType
  title: string
  description: string
  gradient: string
}) {
  return (
    <Card className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors group">
      <CardHeader>
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <CardTitle className="text-slate-100">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-slate-400">{description}</CardDescription>
      </CardContent>
    </Card>
  )
}

function Dashboard() {
  const { user } = useAuth()

  const quickActions = [
    {
      to: '/generate',
      icon: ImagePlus,
      title: 'Generate Images',
      description: 'Create AI-powered product images',
      gradient: 'from-indigo-500 to-blue-500',
    },
    {
      to: '/products',
      icon: ShoppingBag,
      title: 'Manage Products',
      description: 'View and edit synced products',
      gradient: 'from-purple-500 to-pink-500',
    },
    {
      to: '/templates',
      icon: LayoutTemplate,
      title: 'Design Templates',
      description: 'Create Satori image templates',
      gradient: 'from-cyan-500 to-teal-500',
    },
    {
      to: '/feeds',
      icon: FileSpreadsheet,
      title: 'Export Feeds',
      description: 'Generate Facebook catalog feeds',
      gradient: 'from-orange-500 to-amber-500',
    },
  ]

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 mb-2">
            Welcome back{user?.name ? `, ${user.name}` : ''}!
          </h1>
          <p className="text-slate-400">
            What would you like to create today?
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {quickActions.map((action) => (
            <Link key={action.to} to={action.to}>
              <Card className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all hover:scale-[1.02] cursor-pointer group h-full">
                <CardContent className="p-6">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                    <action.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-100 mb-1">
                    {action.title}
                  </h3>
                  <p className="text-sm text-slate-400">{action.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Recent Activity Placeholder */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Layers className="h-5 w-5 text-indigo-400" />
                Recent Generations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-slate-500">
                <ImagePlus className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No recent generations</p>
                <Link to="/generate">
                  <Button variant="link" className="text-indigo-400 mt-2">
                    Start generating
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Download className="h-5 w-5 text-purple-400" />
                Recent Exports
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-slate-500">
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No recent exports</p>
                <Link to="/feeds">
                  <Button variant="link" className="text-purple-400 mt-2">
                    Create a feed
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
