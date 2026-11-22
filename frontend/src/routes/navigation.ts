import {
  Activity,
  Braces,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Rocket,
  Settings,
  Stethoscope,
} from 'lucide-react'

import { paths } from './paths'

export interface NavigationItem {
  label: string
  to: string
  icon: LucideIcon
}

export const navigationItems: readonly NavigationItem[] = [
  { label: 'Overview', to: paths.dashboard, icon: LayoutDashboard },
  { label: 'Catalog', to: paths.catalog, icon: Package },
  { label: 'Deployments', to: paths.deployments, icon: Rocket },
  { label: 'API Explorer', to: paths.apiExplorer, icon: Braces },
  { label: 'Activity', to: paths.activity, icon: Activity },
  { label: 'Diagnostics', to: paths.diagnostics, icon: Stethoscope },
  { label: 'Settings', to: paths.settings, icon: Settings },
]
