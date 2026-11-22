import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CircleMinus,
  CircleSlash,
  CircleX,
  Clock,
  FlaskConical,
  Hourglass,
  LoaderCircle,
  PackageCheck,
  PackageX,
  type LucideIcon,
  TriangleAlert,
  Unplug,
  Undo2,
} from 'lucide-react'

/**
 * Single source of truth for every status the UI can display.
 *
 * Components never hard-code a status label, color or icon: they look the
 * status up here (resolveStatus) and render it with <StatusBadge />.
 * Colors come from the tone, and each tone maps to a token in globals.css.
 */

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface StatusDefinition {
    /** Short text shown to the user. */
    readonly label: string
    /** Visual tone: decides the color, never the meaning. */
    readonly tone: StatusTone
    readonly icon: LucideIcon
    /** One sentence for tooltips and screen readers. */
    readonly description: string
    /** The state can still change (shown with a spinning icon). */
    readonly inProgress: boolean
}

/** Tailwind classes per tone. Written out in full so Tailwind can find them. */
export const TONE_CLASSES: Readonly<
  Record<StatusTone, { readonly text: string; readonly soft: string; readonly border: string; readonly dot: string }>
> = {
  success: { text: 'text-success', soft: 'bg-success/10', border: 'border-success/30', dot: 'bg-success' },
  warning: { text: 'text-warning', soft: 'bg-warning/10', border: 'border-warning/30', dot: 'bg-warning' },
  info: { text: 'text-info', soft: 'bg-info/10', border: 'border-info/30', dot: 'bg-info' },
  danger: { text: 'text-destructive', soft: 'bg-destructive/10', border: 'border-destructive/30', dot: 'bg-destructive' },
  neutral: { text: 'text-neutral', soft: 'bg-neutral/10', border: 'border-neutral/30', dot: 'bg-neutral' },
}

export const STATUS_REGISTRY = {
  /**
   * Health of one system component (frontend, API, catalog, agent, engine, WinGet).
   * 'unknown' means no data source reports this component yet; it is never a guess.
   */
  health: {
    checking: {
      label: 'Checking',
      tone: 'neutral',
      icon: LoaderCircle,
      description: 'Waiting for the first answer.',
      inProgress: true,
    },
    online: {
      label: 'Online',
      tone: 'success',
      icon: CircleCheck,
      description: 'Reachable and answering correctly.',
      inProgress: false,
    },
    degraded: {
      label: 'Degraded',
      tone: 'warning',
      icon: TriangleAlert,
      description: 'Reachable, but not every function is working.',
      inProgress: false,
    },
    offline: {
      label: 'Offline',
      tone: 'danger',
      icon: CircleX,
      description: 'Not reachable.',
      inProgress: false,
    },
    unsupported: {
      label: 'Unsupported',
      tone: 'neutral',
      icon: CircleSlash,
      description: 'Not available on this platform.',
      inProgress: false,
    },
    unknown: {
      label: 'Unknown',
      tone: 'neutral',
      icon: CircleHelp,
      description: 'No data source reports this yet.',
      inProgress: false,
    },
  },

  /** Lifecycle of a deployment operation (GET /api/v1/deployment/operations, Day 5 Step 06). */
  deploymentRequest: {
    queued: {
      label: 'Pending',
      tone: 'neutral',
      icon: Clock,
      description: 'Registered and waiting for the deployment agent.',
      inProgress: true,
    },
    claimed: {
      label: 'Running',
      tone: 'info',
      icon: LoaderCircle,
      description: 'The deployment agent has taken the request and is running it.',
      inProgress: true,
    },
    completed: {
      label: 'Completed',
      tone: 'success',
      icon: CircleCheck,
      description: 'The agent finished the request and reported a result.',
      inProgress: false,
    },
    failed: {
      label: 'Failed',
      tone: 'danger',
      icon: CircleX,
      description: 'The request did not complete. See the result message.',
      inProgress: false,
    },
    cancelled: {
      label: 'Cancelled',
      tone: 'neutral',
      icon: Ban,
      description: 'Cancelled before the agent took it.',
      inProgress: false,
    },
    expired: {
      label: 'Expired',
      tone: 'neutral',
      icon: Hourglass,
      description: 'No deployment agent took the request in time. Nothing was run.',
      inProgress: false,
    },
    lost: {
      label: 'Outcome unknown',
      tone: 'warning',
      icon: Unplug,
      description: 'The agent stopped reporting while running it. Check the machine (Detect) before retrying.',
      inProgress: false,
    },
  },

  /** Whether a DeployForge function can be used right now (System diagnostics). */
  capability: {
    available: {
      label: 'Available',
      tone: 'success',
      icon: CircleCheck,
      description: 'Can be used now.',
      inProgress: false,
    },
    disabled: {
      label: 'Disabled',
      tone: 'neutral',
      icon: CircleMinus,
      description: 'Supported, but switched off by configuration.',
      inProgress: false,
    },
    unavailable: {
      label: 'Unavailable',
      tone: 'danger',
      icon: CircleX,
      description: 'Supported here, but a required component is not running or not reachable.',
      inProgress: false,
    },
    unsupported: {
      label: 'Unsupported',
      tone: 'neutral',
      icon: CircleSlash,
      description: 'Not available on this platform. This is expected, not a failure.',
      inProgress: false,
    },
    unknown: {
      label: 'Unknown',
      tone: 'neutral',
      icon: CircleHelp,
      description: 'No data source reports this yet.',
      inProgress: false,
    },
  },

  /** Installation state reported by a Detect operation (winget list). */
  installation: {
    installed: {
      label: 'Installed',
      tone: 'success',
      icon: PackageCheck,
      description: 'Detected by winget list.',
      inProgress: false,
    },
    not_installed: {
      label: 'Not installed',
      tone: 'neutral',
      icon: PackageX,
      description: 'winget list did not find it.',
      inProgress: false,
    },
    unknown: {
      label: 'Unknown',
      tone: 'neutral',
      icon: CircleHelp,
      description: 'Not detected yet. Run Detect to check.',
      inProgress: false,
    },
  },

  /** DeploymentResult.Status values returned by Invoke-DeployForgeDeployment. */
  engineResult: {
    Installed: {
      label: 'Installed',
      tone: 'success',
      icon: CircleCheck,
      description: 'Installed and confirmed by detection afterwards.',
      inProgress: false,
    },
    AlreadyInstalled: {
      label: 'Already installed',
      tone: 'info',
      icon: CircleMinus,
      description: 'Already installed; nothing was changed.',
      inProgress: false,
    },
    Uninstalled: {
      label: 'Uninstalled',
      tone: 'success',
      icon: Undo2,
      description: 'Uninstalled and confirmed absent by detection afterwards.',
      inProgress: false,
    },
    NotInstalled: {
      label: 'Not installed',
      tone: 'info',
      icon: CircleMinus,
      description: 'Not installed; nothing to uninstall.',
      inProgress: false,
    },
    Failed: {
      label: 'Failed',
      tone: 'danger',
      icon: CircleX,
      description: 'WinGet failed or detection did not confirm the expected state.',
      inProgress: false,
    },
    DryRun: {
      label: 'Dry run',
      tone: 'warning',
      icon: FlaskConical,
      description: 'Simulated with -WhatIf: nothing was executed.',
      inProgress: false,
    },
    Skipped: {
      label: 'Skipped',
      tone: 'neutral',
      icon: Ban,
      description: 'The engine was not confirmed, so nothing ran.',
      inProgress: false,
    },
  },
} as const satisfies Record<string, Record<string, StatusDefinition>>

export type StatusDomain = keyof typeof STATUS_REGISTRY
export type StatusKey<D extends StatusDomain> = keyof (typeof STATUS_REGISTRY)[D] & string

export type HealthStatus = StatusKey<'health'>
export type DeploymentRequestStatus = StatusKey<'deploymentRequest'>
export type EngineResultStatus = StatusKey<'engineResult'>
export type InstallationStatus = StatusKey<'installation'>

/** Shown when the API sends a value this version of the UI does not know. */
export const UNKNOWN_STATUS: StatusDefinition = {
  label: 'Unknown',
  tone: 'neutral',
  icon: CircleHelp,
  description: 'This status is not recognised by this version of DeployForge.',
  inProgress: false,
}

/** Placeholder state before any data exists (e.g. no request selected). */
export const NO_STATUS: StatusDefinition = {
  label: 'None',
  tone: 'neutral',
  icon: CircleDashed,
  description: 'No status available yet.',
  inProgress: false,
}

export function isStatusKey<D extends StatusDomain>(domain: D, value: string): value is StatusKey<D> {
  return Object.hasOwn(STATUS_REGISTRY[domain], value)
}

/**
 * Look up a status. Accepts any string because values come from the API at
 * runtime; unknown values resolve to UNKNOWN_STATUS instead of crashing.
 */
export function resolveStatus<D extends StatusDomain>(domain: D, value: string | null | undefined): StatusDefinition {
  if (value === null || value === undefined || value === '') return NO_STATUS
  if (!isStatusKey(domain, value)) return UNKNOWN_STATUS
  return (STATUS_REGISTRY[domain] as Record<string, StatusDefinition>)[value]
}