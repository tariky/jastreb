import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  FileSpreadsheet,
  Plus,
  Download,
  Facebook,
  ShoppingCart,
  Calendar,
} from 'lucide-react'

export const Route = createFileRoute('/feeds/')({
  component: FeedsPage,
})

function FeedsPage() {
  const navigate = useNavigate()
  const { user, isLoading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: '/auth/login' })
    }
  }, [user, authLoading, navigate])

  if (authLoading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    )
  }

  const feedTypes = [
    {
      icon: Facebook,
      title: 'Facebook Commerce',
      description: 'CSV format for Facebook & Instagram shops',
      gradient: 'from-blue-500 to-indigo-500',
      badge: 'Popular',
    },
    {
      icon: ShoppingCart,
      title: 'Google Merchant',
      description: 'Product feed for Google Shopping',
      gradient: 'from-red-500 to-orange-500',
      badge: 'Coming Soon',
      disabled: true,
    },
  ]

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2 flex items-center gap-3">
              <FileSpreadsheet className="h-8 w-8 text-orange-400" />
              Product Feeds
            </h1>
            <p className="text-slate-400">
              Generate and manage commerce catalog feeds
            </p>
          </div>
          <Button className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500">
            <Plus className="h-4 w-4 mr-2" />
            New Feed
          </Button>
        </div>

        {/* Feed Types */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Feed Types</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {feedTypes.map((type, i) => (
              <Card
                key={i}
                className={`bg-slate-900/50 border-slate-800 transition-all group ${
                  type.disabled
                    ? 'opacity-60 cursor-not-allowed'
                    : 'hover:border-slate-700 cursor-pointer hover:scale-[1.02]'
                }`}
              >
                <CardContent className="p-6 flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${type.gradient} flex items-center justify-center shadow-lg ${!type.disabled && 'group-hover:scale-110'} transition-transform shrink-0`}>
                    <type.icon className="h-7 w-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-slate-100">
                        {type.title}
                      </h3>
                      {type.badge && (
                        <Badge
                          variant={type.disabled ? 'secondary' : 'default'}
                          className={
                            type.disabled
                              ? 'bg-slate-700 text-slate-400'
                              : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                          }
                        >
                          {type.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-400">{type.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Empty State */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100">Your Feeds</CardTitle>
            <CardDescription className="text-slate-400">
              Feeds you've created will appear here
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center mx-auto mb-6">
                <FileSpreadsheet className="h-10 w-10 text-orange-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-100 mb-2">
                No feeds yet
              </h3>
              <p className="text-slate-400 max-w-md mx-auto mb-6">
                Create a feed to export your products for Facebook Commerce or other platforms.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button className="bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Facebook Feed
                </Button>
                <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
                  <Download className="h-4 w-4 mr-2" />
                  Export All Products
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Info Cards */}
        <div className="grid md:grid-cols-2 gap-4 mt-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <Calendar className="h-5 w-5 text-indigo-400" />
                <h3 className="font-semibold text-slate-200">Scheduled Exports</h3>
              </div>
              <p className="text-sm text-slate-400">
                Set up automatic feed generation on a daily or weekly schedule.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <FileSpreadsheet className="h-5 w-5 text-purple-400" />
                <h3 className="font-semibold text-slate-200">Custom Columns</h3>
              </div>
              <p className="text-sm text-slate-400">
                Map your product data to custom feed columns and formats.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

