import { Suspense } from 'react'
import { Hammer } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'

import { ApiStatusIndicator } from '@/components/ApiStatusIndicator'
import { PageErrorBoundary } from '@/components/feedback/PageErrorBoundary'
import { PageLoader } from '@/components/feedback/PageLoader'
import { ThemeToggle } from '@/components/ThemeToggle'
import { cn } from '@/lib/utils'
import { navigationItems } from '@/routes/navigation'
import { paths } from '@/routes/paths'

export function AppLayout() {
  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4 font-semibold">
          <Hammer className="size-5" aria-hidden />
          DeployForge
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1 p-2">
          {navigationItems.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === paths.dashboard}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-2 border-b px-4">
          <nav aria-label="Main (compact)" className="mr-auto flex gap-1 overflow-x-auto md:hidden">
            {navigationItems.map(({ label, to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === paths.dashboard}
                aria-label={label}
                title={label}
                className={({ isActive }) =>
                  cn('rounded-md p-2 hover:bg-accent', isActive && 'bg-accent text-accent-foreground')
                }
              >
                <Icon className="size-4" aria-hidden />
              </NavLink>
            ))}
          </nav>
          <ApiStatusIndicator />
          <ThemeToggle />
        </header>
        <main className="flex-1 p-6">
          <PageErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  )
}
