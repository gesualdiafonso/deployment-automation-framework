import type { ApplicationSourceType } from '@/types/api'

/**
 * What the DeployForge engine can do for each catalog source type.
 *
 * This mirrors the switch in Get-DeployForgeDeploymentPlan.ps1 (engine rules, not
 * catalog data): only 'winget' and 'msstore' produce a plan; every other source
 * type is reported as unsupported. The API does not expose this yet, so keep
 * this table in sync with the engine until it does.
 */

export interface OperationSupport {
  readonly supported: boolean
  /** How the engine performs it, or why it cannot. */
  readonly method: string
}

export interface EngineSupport {
  readonly install: OperationSupport
  readonly uninstall: OperationSupport
  /** Requirements on the machine that runs the engine. */
  readonly platform: readonly string[]
}

const WINGET_PLATFORM = ['Windows', 'WinGet (App Installer)', 'PowerShell 7.2 or later'] as const

function viaWinget(source: 'winget' | 'msstore'): EngineSupport {
  return {
    install: { supported: true, method: `winget install --id <package ID> --exact --source ${source}, silent` },
    uninstall: { supported: true, method: `winget uninstall --id <package ID> --exact --source ${source}, silent` },
    platform: WINGET_PLATFORM,
  }
}

function unsupported(source: string): EngineSupport {
  const reason = `The engine does not support the '${source}' source type yet.`
  return {
    install: { supported: false, method: reason },
    uninstall: { supported: false, method: reason },
    platform: [],
  }
}

export function getEngineSupport(sourceType: ApplicationSourceType): EngineSupport {
  return sourceType === 'winget' || sourceType === 'msstore' ? viaWinget(sourceType) : unsupported(sourceType)
}

export const SOURCE_LABELS: Readonly<Record<ApplicationSourceType, string>> = {
  winget: 'WinGet',
  msstore: 'Microsoft Store',
  direct: 'Direct download',
  local: 'Local package',
}

/** Catalog versions the engine treats as "no pinned version" (no --version argument). */
export function isUnpinnedVersion(version: string): boolean {
  return version === 'latest' || version === 'stable'
}
