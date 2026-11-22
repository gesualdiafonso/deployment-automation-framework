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
      <aside className="sticky top-0 hidden h-svh w-sidebar shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground backdrop-blur-xl backdrop-saturate-150 md:flex">
        <div className="flex h-header items-center gap-2.5 px-5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-linear-to-b from-[#3a8dff] to-[#0062d6] text-white shadow-sm">
            <Hammer className="size-4" aria-hidden />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">DeployForge</span>
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-3 py-2">
          {navigationItems.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === paths.dashboard}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent',
                  isActive && 'bg-sidebar-accent font-medium text-sidebar-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('size-4', isActive ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-header items-center justify-end gap-2 border-b border-border/60 bg-background/75 px-4 backdrop-blur-xl backdrop-saturate-150 md:px-8">
          <nav aria-label="Main (compact)" className="mr-auto flex gap-1 overflow-x-auto md:hidden">
            {navigationItems.map(({ label, to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === paths.dashboard}
                aria-label={label}
                title={label}
                className={({ isActive }) => cn('rounded-lg p-2 hover:bg-accent', isActive && 'bg-accent text-primary')}
              >
                <Icon className="size-4" aria-hidden />
              </NavLink>
            ))}
          </nav>
          <ApiStatusIndicator />
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-8 md:px-8">
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
