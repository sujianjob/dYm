import { ArrowLeft, Users, Download, Tags, Settings } from 'lucide-react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const navItems = [
  { path: '/settings/users', label: '用户管理', icon: Users },
  { path: '/settings/download', label: '视频下载', icon: Download },
  { path: '/settings/analysis', label: '视频分析', icon: Tags },
  { path: '/settings/system', label: '系统设置', icon: Settings }
]

export default function SettingsLayout() {
  const location = useLocation()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center px-6">
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Button>
        </Link>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className="w-56 border-r border-border">
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link key={item.path} to={item.path}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={cn('w-full justify-start gap-2', isActive && 'bg-secondary')}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Content */}
        <ScrollArea className="flex-1 bg-muted/30">
          <main className="p-8 max-w-5xl">
            <Outlet />
          </main>
        </ScrollArea>
      </div>
    </div>
  )
}
