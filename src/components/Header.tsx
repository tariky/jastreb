import { Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  ChevronDown,
  Home,
  Menu,
  X,
  Sparkles,
  ImagePlus,
  ShoppingBag,
  FileSpreadsheet,
  LayoutTemplate,
  Settings,
  LogOut,
  User,
  Loader2,
} from 'lucide-react'

export default function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()
  const { user, isLoading, logout, logoutPending } = useAuth()

  // Don't show header on auth pages
  const pathname = router.state.location.pathname
  if (pathname.startsWith('/auth')) {
    return null
  }

  const handleLogout = async () => {
    await logout()
    router.navigate({ to: '/auth/login' })
  }

  const navItems = [
    { to: '/', icon: Home, label: 'Dashboard' },
    { to: '/generate', icon: ImagePlus, label: 'AI Generate' },
    { to: '/products', icon: ShoppingBag, label: 'Products' },
    { to: '/templates', icon: LayoutTemplate, label: 'Templates' },
    { to: '/feeds', icon: FileSpreadsheet, label: 'Feeds' },
  ]

  return (
    <>
      <header className="px-4 py-3 flex items-center justify-between bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsOpen(true)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={20} className="text-slate-300" />
          </button>
          
          <Link to="/" className="flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-indigo-400" />
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent font-['Outfit',sans-serif]">
              Jastreb
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1 ml-8">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-sm font-medium"
                activeProps={{
                  className:
                    'flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-sm font-medium',
                }}
              >
                <item.icon size={16} />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-3">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 hover:bg-slate-800"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-indigo-600 text-white text-sm">
                      {user.name?.[0] || user.email[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-slate-300 hidden sm:inline">
                    {user.name || user.email}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 bg-slate-900 border-slate-800"
              >
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium text-slate-200">
                    {user.name || 'User'}
                  </p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <DropdownMenuSeparator className="bg-slate-800" />
                <DropdownMenuItem className="text-slate-300 focus:bg-slate-800 focus:text-slate-100">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <Link to="/settings">
                  <DropdownMenuItem className="text-slate-300 focus:bg-slate-800 focus:text-slate-100 w-full">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator className="bg-slate-800" />
                <DropdownMenuItem
                  onClick={handleLogout}
                  disabled={logoutPending}
                  className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
                >
                  {logoutPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="mr-2 h-4 w-4" />
                  )}
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/auth/login">
                <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-slate-800">
                  Sign in
                </Button>
              </Link>
              <Link to="/auth/register">
                <Button className="bg-indigo-600 hover:bg-indigo-500">
                  Get Started
                </Button>
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Mobile Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-slate-900 border-r border-slate-800 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-indigo-400" />
            <span className="text-lg font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Jastreb
            </span>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors mb-1"
              activeProps={{
                className:
                  'flex items-center gap-3 p-3 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 mb-1',
              }}
            >
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        {user && (
          <div className="p-4 border-t border-slate-800">
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-indigo-600 text-white">
                  {user.name?.[0] || user.email[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">
                  {user.name || 'User'}
                </p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <Button
              onClick={handleLogout}
              disabled={logoutPending}
              variant="outline"
              className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              {logoutPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              Sign out
            </Button>
          </div>
        )}
      </aside>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  )
}
