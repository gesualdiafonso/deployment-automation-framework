/**
 * Contracts of the deployment interface (Day 5 Step 06).
 * Mirrors backend/app/schemas/deployment.py; keep them in sync.
 */

import type { Application } from './api'

export type DeploymentAction = 'install' | 'uninstall' | 'detect'
export type ChangeAction = Exclude<DeploymentAction, 'detect'>
export type DeploymentMode = 'dry_run' | 'execute'
export type OperationState = 'queued' | 'claimed' | 'completed' | 'failed' | 'cancelled' | 'expired' | 'lost'
export type EngineStatus = 'Installed' | 'AlreadyInstalled' | 'Uninstalled' | 'NotInstalled' | 'Failed' | 'DryRun' | 'Skipped'
export type AgentState = 'never_seen' | 'online' | 'offline' | 'unsupported'

export const TERMINAL_STATES: ReadonlySet<OperationState> = new Set(['completed', 'failed', 'cancelled', 'expired', 'lost'])

export interface WingetInfo {
  available: boolean
  version: string | null
}

export interface DeploymentStatus {
  agent: {
    state: AgentState
    last_heartbeat_at: string | null
    platform: 'windows' | 'macos' | 'linux' | null
    os_version: string | null
    powershell_version: string | null
    engine_version: string | null
    elevated: boolean | null
    winget: WingetInfo | null
    execute_enabled: boolean | null
  }
  queue: { queued: number; running: number }
}

export interface PreviewRequest {
  application_id: string
  action: ChangeAction
  mode: DeploymentMode
}

export interface PreviewResponse {
  application: Application
  action: ChangeAction
  mode: DeploymentMode
  supported: boolean
  notes: string[]
  warnings: string[]
  agent_ready: boolean
  confirmation_token: string | null
  expires_at: string | null
}

export type OperationCreateRequest =
  | { application_id: string; action: ChangeAction; mode: DeploymentMode; confirmation_token: string }
  | { application_id: string; action: 'detect' }

export interface OperationResult {
  engine_status: EngineStatus | null
  exit_code: number | null
  verified: boolean | null
  detected_installed: boolean | null
  message: string
  engine_operation_id: string | null
  log_file: string | null
}

export interface Operation {
  operation_id: string
  application_id: string
  application_name: string
  action: DeploymentAction
  mode: DeploymentMode | null
  state: OperationState
  created_at: string
  claimed_at: string | null
  finished_at: string | null
  result: OperationResult | null
  error: string | null
}

export interface OperationListResponse {
  operations: Operation[]
  total: number
}

/** One line of logs/audit/deployforge-audit.jsonl (GET /api/v1/deployment/audit). */
export interface AuditRecord {
  timestamp: string
  event: string
  operation_id: string | null
  application_id: string | null
  action: string | null
  mode: string | null
  state: string | null
  engine_status: string | null
  exit_code: number | null
  engine_operation_id: string | null
  log_file: string | null
  origin: string | null
  agent_id: string | null
  reason: string | null
}

export interface AuditLogResponse {
  records: AuditRecord[]
  total: number
  skipped_lines: number
  truncated: boolean
}
