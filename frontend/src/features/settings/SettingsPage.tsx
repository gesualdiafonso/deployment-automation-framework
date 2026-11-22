import type { ReactNode } from 'react'
import { CircleCheck, CircleX, ExternalLink, Monitor, Moon, PlugZap, Sun } from 'lucide-react'
import { Link } from 'react-router'

import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { ErrorState } from '@/components/feedback/ErrorState'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { deriveCapabilities } from '@/features/diagnostics/lib/capabilities'
import { useApplications } from '@/hooks/use-applications'
import { useDocumentationLinks } from '@/hooks/use-api-explorer'
import { useDeploymentStatus } from '@/hooks/use-deployment'
import { useConnectionTest, useHealth } from '@/hooks/use-health'
import { useTheme } from '@/hooks/use-theme'
import { deploymentsAllowed, effectiveApiOrigin, getConfig, isLoopbackUrl } from '@/lib/env'
import { getErrorMessage } from '@/lib/errors'
import { paths } from '@/routes/paths'
import { DOCUMENTATION_PATHS } from '@/services/api-explorer.service'
import { buildApiUrl } from '@/services/api/http-client'

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

/** Repository documents, listed by path (they live in the repository, not on a server). */
const REPOSITORY_DOCS = [
  ['README.md', 'Overview, setup on Windows, macOS and Linux'],
  ['docs/deployment-agent.md', 'Deployment interface, agent, states and threat model'],
  ['docs/api-reference.md', 'Catalog API reference'],
  ['docs/security.md', 'Security model and known limits'],
  ['frontend/README.md', 'Frontend structure and environment variables'],
] as const

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-2 text-sm sm:grid-cols-[13rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 wrap-break-word">{children}</dd>
    </div>
  )
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  const Icon = ok ? CircleCheck : CircleX
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className={ok ? 'mt-0.5 size-4 shrink-0 text-success' : 'mt-0.5 size-4 shrink-0 text-destructive'} aria-hidden />
      <span>{children}</span>
    </li>
  )
}

function storageAvailable(): boolean {
  try {
    const probe = '__deployforge_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

function Appearance() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const systemSupported = typeof window.matchMedia === 'function'
  const persisted = storageAvailable()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          {persisted
            ? 'Saved on this device.'
            : 'Browser storage is unavailable, so the choice lasts for this session only.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              role="radio"
              aria-checked={theme === value}
              variant={theme === value ? 'default' : 'outline'}
              disabled={value === 'system' && !systemSupported}
              onClick={() => setTheme(value)}
            >
              <Icon aria-hidden />
              {label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Showing the {resolvedTheme} theme
          {theme === 'system' ? ', following the operating system setting' : ''}.
          {!systemSupported ? ' This browser does not report a system theme.' : ''}
        </p>
      </CardContent>
    </Card>
  )
}

function BackendConnection() {
  const config = getConfig()
  const health = useHealth()
  const test = useConnectionTest()
  const origin = effectiveApiOrigin(config)
  const local = isLoopbackUrl(origin)
  const result = test.data

  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto] items-center">
        <div className="space-y-1">
          <CardTitle>Backend connection</CardTitle>
          <CardDescription>Set at build time. The interface cannot change it.</CardDescription>
        </div>
        <StatusBadge domain="health" value={health.isPending ? 'checking' : health.isSuccess ? 'online' : 'offline'} />
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="divide-y">
          <Row label="API base URL">
            <span className="font-mono">{config.apiBaseUrl || '(empty: same origin)'}</span>
            <span className="block text-xs text-muted-foreground">VITE_API_BASE_URL</span>
          </Row>
          <Row label="Requests go to">
            <span className="font-mono">{origin}</span>
            {!config.apiBaseUrl ? (
              <span className="block text-xs text-muted-foreground">
                Through the development proxy
              </span>
            ) : null}
          </Row>
          <Row label="Request timeout">{config.apiTimeoutMs} ms</Row>
          <Row label="Connection status">
            {health.isError ? (
              <span className="text-destructive">{getErrorMessage(health.error)}</span>
            ) : health.isSuccess ? (
              `${health.data.service} ${health.data.version}, checked ${new Date(health.dataUpdatedAt).toLocaleTimeString()}`
            ) : (
              'Checking…'
            )}
          </Row>
        </dl>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Configuration validation</h3>
          <ul className="space-y-1.5">
            <Check ok>Valid URL</Check>
            <Check ok={Number.isInteger(config.apiTimeoutMs) && config.apiTimeoutMs > 0}>Valid timeout</Check>
            <Check ok={local}>{local ? 'Local API, deployments allowed' : 'Remote API, deployments disabled'}</Check>
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Connection test</h3>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => test.mutate()} disabled={test.isPending}>
              <PlugZap aria-hidden />
              {test.isPending ? 'Testing…' : 'Test connection'}
            </Button>
            <code className="text-xs text-muted-foreground">GET {buildApiUrl('/health')}</code>
          </div>
          {test.isError ? (
            <ErrorState title="Connection failed" message={getErrorMessage(test.error)} />
          ) : result ? (
            <p className={result.ok && result.json ? 'text-sm text-success' : 'text-sm text-destructive'} role="status">
              {result.ok && result.json
                ? `Connected: HTTP ${result.status} in ${result.durationMs} ms.`
                : !result.json && [502, 503, 504].includes(result.status)
                  ? `Not reachable: the development proxy answered HTTP ${result.status} because the API is not running at its target.`
                  : `The server answered HTTP ${result.status} in ${result.durationMs} ms${result.json ? '' : ' without JSON (is the DeployForge API running?)'}.`}
            </p>
          ) : null}
        </section>

        <p className="text-xs text-muted-foreground">
          To use another API, edit <code className="font-mono">frontend/.env.local</code> and restart.
        </p>
      </CardContent>
    </Card>
  )
}

function PlatformInformation() {
  const health = useHealth()
  const applications = useApplications()
  const deployment = useDeploymentStatus()
  const agent = deployment.data?.agent
  const capabilities = deriveCapabilities(health, applications, deployment)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform</CardTitle>
        <CardDescription>
          More in <Link className="text-primary hover:underline" to={paths.diagnostics}>Diagnostics</Link>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="divide-y">
          <Row label="Agent platform">
            {agent && agent.state !== 'never_seen' ? (
              `${agent.platform ?? 'unknown'}${agent.os_version ? ` (${agent.os_version})` : ''}${agent.state === 'offline' ? ', last reported' : ''}`
            ) : (
              <span className="text-muted-foreground italic">Not reported (agent not connected)</span>
            )}
          </Row>
          <Row label="Deployment engine">
            {agent?.state === 'online' && agent.engine_version ? (
              `DeployForge engine ${agent.engine_version} on PowerShell ${agent.powershell_version ?? '?'}`
            ) : agent?.state === 'unsupported' ? (
              <StatusBadge domain="capability" value="unsupported" />
            ) : (
              <StatusBadge domain="capability" value={deployment.isPending ? 'unknown' : 'unavailable'} />
            )}
          </Row>
          <Row label="Deployments from this UI">
            <StatusBadge domain="capability" value={deploymentsAllowed() ? 'available' : 'disabled'} />
            <span className="ml-2 text-xs text-muted-foreground">
              {deploymentsAllowed() ? 'local API' : 'remote API: disabled for safety'}
            </span>
          </Row>
        </dl>
        <ul className="divide-y rounded-xl bg-card ring-1 ring-border">
          {capabilities.map((capability) => (
            <li key={capability.name} className="grid gap-1 px-3 py-2 sm:grid-cols-[13rem_8rem_1fr] sm:items-center sm:gap-3">
              <span className="text-sm">{capability.name}</span>
              <StatusBadge domain="capability" value={capability.status} />
              <span className="min-w-0 text-xs wrap-anywhere text-muted-foreground">{capability.detail}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function ApplicationInformation() {
  const health = useHealth()
  const deployment = useDeploymentStatus()
  const docs = useDocumentationLinks()
  const engineVersion = deployment.data?.agent.engine_version
  const availableDocs = DOCUMENTATION_PATHS.filter((_, index) => docs[index]?.data === true)

  return (
    <Card>
      <CardHeader>
        <CardTitle>About</CardTitle>
        <CardDescription>Version of each component.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="divide-y">
          <Row label="Frontend">
            <span className="font-mono">{__DEPLOYFORGE_UI_VERSION__}</span>
          </Row>
          <Row label="Backend API">
            {health.isSuccess ? <span className="font-mono">{health.data.version}</span> : <span className="text-muted-foreground italic">Unavailable</span>}
          </Row>
          <Row label="PowerShell engine">
            {engineVersion ? <span className="font-mono">{engineVersion}</span> : <span className="text-muted-foreground italic">Not reported (agent not connected)</span>}
          </Row>
        </dl>
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Documentation</h3>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {availableDocs.map((path) => (
              <a key={path} href={buildApiUrl(path)} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-mono text-primary hover:underline">
                {path}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ))}
            {availableDocs.length === 0 && !docs.some((query) => query.isPending) ? (
              <span className="text-xs text-muted-foreground">API documentation is not reachable.</span>
            ) : null}
            <Link to={paths.apiExplorer} className="text-primary hover:underline">
              API Explorer
            </Link>
          </div>
          <ul className="space-y-1 text-xs">
            {REPOSITORY_DOCS.map(([path, description]) => (
              <li key={path}>
                <code className="font-mono">{path}</code> <span className="text-muted-foreground">: {description}</span>
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Appearance, connection and version information."
      />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <Appearance />
          <BackendConnection />
        </div>
        <div className="min-w-0 space-y-4">
          <PlatformInformation />
          <ApplicationInformation />
        </div>
      </div>
    </div>
  )
}
