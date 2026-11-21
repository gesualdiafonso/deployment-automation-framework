import { lazy } from 'react'
import { createBrowserRouter } from 'react-router'

import { RouteErrorPage } from '@/components/feedback/RouteErrorPage'
import { AppLayout } from '@/layouts/AppLayout'

// Each feature is code-split; AppLayout shows <PageLoader /> while a page loads.
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const CatalogPage = lazy(() => import('@/features/catalog/CatalogPage'))
const DeploymentsPage = lazy(() => import('@/features/deployments/DeploymentsPage'))
const ApiExplorerPage = lazy(() => import('@/features/api-explorer/ApiExplorerPage'))
const ActivityPage = lazy(() => import('@/features/activity/ActivityPage'))
const DiagnosticsPage = lazy(() => import('@/features/diagnostics/DiagnosticsPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))
const NotFoundPage = lazy(() => import('@/routes/NotFoundPage'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'catalog', element: <CatalogPage /> },
      { path: 'deployments', element: <DeploymentsPage /> },
      { path: 'api-explorer', element: <ApiExplorerPage /> },
      { path: 'activity', element: <ActivityPage /> },
      { path: 'diagnostics', element: <DiagnosticsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
