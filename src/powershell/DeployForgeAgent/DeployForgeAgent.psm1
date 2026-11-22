Set-StrictMode -Version Latest

# The DeployForge agent: a local process that takes approved operations from the
# DeployForge API and runs them with the DeployForge engine. It opens no port, and
# it receives only three typed values per operation (application_id, action, mode):
# no command, path or argument ever comes from the API or the browser.

$script:EngineManifest = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../DeployForge/DeployForge.psd1'))
$script:AgentManifest  = Join-Path $PSScriptRoot 'DeployForgeAgent.psd1'
$script:IdPattern      = '^[a-z0-9]+(?:-[a-z0-9]+)*$'
# The only engine actions the agent can run. Anything else is refused.
$script:EngineActions  = @{ install = 'Install'; uninstall = 'Uninstall' }
$script:MaxMessageLength = 2000

Import-Module $script:EngineManifest

function ConvertTo-DeployForgeAgentText {
    param([AllowNull()][object]$Value)
    $text = if ($null -eq $Value) { '' } else { [string]$Value }
    if ($text.Length -gt $script:MaxMessageLength) { $text = $text.Substring(0, $script:MaxMessageLength) }
    $text
}

function Get-DeployForgeAgentWingetInfo {
    <#
    .SYNOPSIS
        Reports whether winget is on PATH and its version ('winget --version', read-only).
    #>
    [CmdletBinding()]
    [OutputType([hashtable])]
    param()

    $winget = Get-Command -Name 'winget' -CommandType Application -ErrorAction SilentlyContinue
    if (-not $IsWindows -or -not $winget) {
        return @{ available = $false; version = $null }
    }
    $version = $null
    try {
        $version = (& $winget.Source --version 2>$null | Select-Object -First 1)
        if ($version) { $version = ([string]$version).Trim() }
        if ($version -and $version.Length -gt 50) { $version = $version.Substring(0, 50) }
    }
    catch {
        $version = $null
    }
    @{ available = $true; version = $version }
}

function Get-DeployForgeAgentHeartbeat {
    <#
    .SYNOPSIS
        Builds the heartbeat body: platform, versions, elevation, winget, execution flag.
    #>
    [CmdletBinding()]
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][string]$AgentId,
        [Parameter(Mandatory)][hashtable]$Winget,
        [bool]$ExecuteEnabled,
        [string]$CurrentOperationId
    )

    $platform = if ($IsWindows) { 'windows' } elseif ($IsMacOS) { 'macos' } else { 'linux' }
    $elevated = $false
    if ($IsWindows) {
        $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
        $elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    }

    @{
        agent_id             = $AgentId
        platform             = $platform
        os_version           = [System.Environment]::OSVersion.VersionString
        powershell_version   = $PSVersionTable.PSVersion.ToString()
        engine_version       = (Import-PowerShellDataFile -LiteralPath $script:EngineManifest).ModuleVersion
        elevated             = [bool]$elevated
        winget               = $Winget
        execute_enabled      = [bool]$ExecuteEnabled
        current_operation_id = if ($CurrentOperationId) { $CurrentOperationId } else { $null }
    }
}

function Invoke-DeployForgeAgentOperation {
    <#
    .SYNOPSIS
        Runs one claimed operation with the engine and returns the result body for the API.
    .DESCRIPTION
        Re-validates everything the API sent: the ID format, the action against a fixed map,
        and the mode. 'dry_run' always runs the engine with -WhatIf. 'execute' runs only when
        the agent was started with DEPLOYFORGE_AGENT_ALLOW_EXECUTE=1. 'detect' is read-only.
        Never throws: failures become @{ error = '...' }.
    #>
    [CmdletBinding()]
    [OutputType([hashtable])]
    param(
        [Parameter(Mandatory)][pscustomobject]$Operation,
        [bool]$AllowExecute
    )

    try {
        $id = [string]$Operation.application_id
        $action = [string]$Operation.action
        $mode = if ($null -eq $Operation.mode) { $null } else { [string]$Operation.mode }

        if ($id -cnotmatch $script:IdPattern) {
            throw "Refused: '$id' is not a valid application ID."
        }

        if ($action -eq 'detect') {
            if ($null -ne $mode) { throw 'Refused: detect does not take a mode.' }
            $state = Get-DeployForgeApplicationState -Id $id
            return @{
                result = @{
                    engine_status       = $null
                    exit_code           = $null
                    verified            = $null
                    detected_installed  = [bool]$state.Installed
                    message             = if ($state.Installed) { "$($state.Name) is installed." } else { "$($state.Name) is not installed." }
                    engine_operation_id = $null
                    log_file            = $null
                }
            }
        }

        if (-not $script:EngineActions.ContainsKey($action)) {
            throw "Refused: action '$action' is not allowed."
        }
        $engineAction = $script:EngineActions[$action]

        switch ($mode) {
            'dry_run' {
                $result = Invoke-DeployForgeDeployment -Id $id -Action $engineAction -WhatIf
            }
            'execute' {
                if (-not $AllowExecute) {
                    throw 'Refused: real execution is disabled on this agent (DEPLOYFORGE_AGENT_ALLOW_EXECUTE is not set).'
                }
                $result = Invoke-DeployForgeDeployment -Id $id -Action $engineAction -Confirm:$false
            }
            default {
                throw "Refused: mode '$mode' is not allowed."
            }
        }

        @{
            result = @{
                engine_status       = [string]$result.Status
                exit_code           = if ($null -eq $result.ExitCode) { $null } else { [int]$result.ExitCode }
                verified            = if ($null -eq $result.Verified) { $null } else { [bool]$result.Verified }
                detected_installed  = $null
                message             = ConvertTo-DeployForgeAgentText $result.Message
                engine_operation_id = [string]$result.OperationId
                # Only the file name: absolute paths never leave the machine's logs.
                log_file            = if ($result.LogPath) { Split-Path -Path $result.LogPath -Leaf } else { $null }
            }
        }
    }
    catch {
        @{ error = ConvertTo-DeployForgeAgentText $_.Exception.Message }
    }
}

function Invoke-DeployForgeAgentApi {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][hashtable]$Headers,
        [object]$Body
    )

    $parameters = @{
        Uri                = "$BaseUrl$Path"
        Method             = 'Post'
        Headers            = $Headers
        ContentType        = 'application/json'
        StatusCodeVariable = 'statusCode'
        TimeoutSec         = 15
    }
    if ($PSBoundParameters.ContainsKey('Body')) {
        $parameters.Body = ($Body | ConvertTo-Json -Depth 5 -Compress)
    }
    $response = Invoke-RestMethod @parameters
    [pscustomobject]@{ StatusCode = $statusCode; Body = $response }
}

function Start-DeployForgeAgent {
    <#
    .SYNOPSIS
        Runs the DeployForge agent until stopped (Ctrl+C).
    .DESCRIPTION
        Sends a heartbeat, takes the oldest queued operation, runs it in a background thread
        (heartbeats continue meanwhile), and reports the result. Runs only on Windows and only
        against a loopback API. Real installs and uninstalls need DEPLOYFORGE_AGENT_ALLOW_EXECUTE=1;
        without it every operation is a dry run or a read-only detection.
    .EXAMPLE
        Import-Module ./src/powershell/DeployForgeAgent/DeployForgeAgent.psd1
        Start-DeployForgeAgent
    #>
    # A long-running service loop, not a one-shot change: -WhatIf/-Confirm would not mean anything here.
    # Every state change is gated per operation by the API confirmation token and DEPLOYFORGE_AGENT_ALLOW_EXECUTE.
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '',
        Justification = 'Service loop; each operation is confirmed in the API and gated by DEPLOYFORGE_AGENT_ALLOW_EXECUTE.')]
    [CmdletBinding()]
    param(
        [string]$ApiBaseUrl = 'http://127.0.0.1:8000',

        [string]$TokenPath = $(if ($env:DEPLOYFORGE_AGENT_TOKEN_FILE) { $env:DEPLOYFORGE_AGENT_TOKEN_FILE } elseif ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'DeployForge/agent.token' } else { '' }),

        [ValidateRange(1, 60)][int]$PollSeconds = 3,

        [ValidateRange(2, 25)][int]$HeartbeatSeconds = 10
    )

    if (-not $IsWindows) {
        throw 'The DeployForge agent runs only on Windows. The catalog and API remain available on this platform.'
    }

    $uri = [Uri]$ApiBaseUrl
    if (-not $uri.IsLoopback -or $uri.Scheme -ne 'http') {
        throw "ApiBaseUrl must be a local http address (127.0.0.1 or localhost): $ApiBaseUrl"
    }
    $baseUrl = $ApiBaseUrl.TrimEnd('/') + '/api/v1/agent'

    $allowExecute = ($env:DEPLOYFORGE_AGENT_ALLOW_EXECUTE -eq '1')
    $agentId = ("$env:COMPUTERNAME-$PID" -replace '[^A-Za-z0-9-]', '-')
    if ($agentId.Length -gt 64) { $agentId = $agentId.Substring(0, 64) }

    $tokenFile = $TokenPath
    $readToken = {
        if (-not $tokenFile -or -not (Test-Path -LiteralPath $tokenFile -PathType Leaf)) {
            throw "Agent token file not found: start the DeployForge API first ($tokenFile)."
        }
        (Get-Content -LiteralPath $tokenFile -Raw).Trim()
    }
    # Mutated in place when the token rotates; the token itself is never written to output.
    $headers = @{ Authorization = "Bearer $(& $readToken)"; 'X-DeployForge-Agent-Id' = $agentId }
    $winget = Get-DeployForgeAgentWingetInfo

    Write-Information "DeployForge agent $agentId started. API: $ApiBaseUrl. Real execution: $(if ($allowExecute) { 'ENABLED' } else { 'disabled (dry run and detect only)' })." -InformationAction Continue

    $send = {
        param([string]$Path, [object]$Body)
        try {
            if ($PSBoundParameters.ContainsKey('Body')) {
                Invoke-DeployForgeAgentApi -BaseUrl $baseUrl -Path $Path -Headers $headers -Body $Body
            }
            else {
                Invoke-DeployForgeAgentApi -BaseUrl $baseUrl -Path $Path -Headers $headers
            }
        }
        catch {
            $status = $null
            if ($_.Exception.PSObject.Properties['Response'] -and $_.Exception.Response) {
                $status = [int]$_.Exception.Response.StatusCode
            }
            if ($status -eq 401) {
                # The API rotates the token on every start: read it again for the next call.
                try { $headers['Authorization'] = "Bearer $(& $readToken)" } catch { Write-Warning $_.Exception.Message }
            }
            Write-Warning "API call $Path failed: $($_.Exception.Message)"
            $null
        }
    }

    $lastHeartbeat = [datetime]::MinValue
    while ($true) {
        if (([datetime]::UtcNow - $lastHeartbeat).TotalSeconds -ge $HeartbeatSeconds) {
            $null = & $send '/heartbeat' (Get-DeployForgeAgentHeartbeat -AgentId $agentId -Winget $winget -ExecuteEnabled $allowExecute)
            $lastHeartbeat = [datetime]::UtcNow
        }

        $claim = & $send '/operations/claim'
        if ($claim -and $claim.StatusCode -eq 200 -and $claim.Body) {
            $operation = $claim.Body
            Write-Information "Running $($operation.action) ($($operation.mode)) for '$($operation.application_id)' [$($operation.operation_id)]." -InformationAction Continue

            $agentManifest = $script:AgentManifest
            $job = Start-ThreadJob -ScriptBlock {
                Import-Module $using:agentManifest
                Invoke-DeployForgeAgentOperation -Operation $using:operation -AllowExecute $using:allowExecute
            }
            while (-not (Wait-Job -Job $job -Timeout $HeartbeatSeconds)) {
                $null = & $send '/heartbeat' (Get-DeployForgeAgentHeartbeat -AgentId $agentId -Winget $winget -ExecuteEnabled $allowExecute -CurrentOperationId $operation.operation_id)
                $lastHeartbeat = [datetime]::UtcNow
            }
            $report = Receive-Job -Job $job -ErrorAction SilentlyContinue | Where-Object { $_ -is [hashtable] } | Select-Object -Last 1
            if ($job.State -ne 'Completed' -or -not $report) {
                $reason = if ($job.ChildJobs -and $job.ChildJobs[0].JobStateInfo.Reason) { $job.ChildJobs[0].JobStateInfo.Reason.Message } else { 'The operation thread ended without a result.' }
                $report = @{ error = ConvertTo-DeployForgeAgentText $reason }
            }
            Remove-Job -Job $job -Force

            $null = & $send "/operations/$($operation.operation_id)/result" $report
            $outcome = if ($report.ContainsKey('error')) { "error: $($report.error)" } else { "status: $($report.result.engine_status) $($report.result.message)" }
            Write-Information "Finished [$($operation.operation_id)] $outcome" -InformationAction Continue
            continue
        }

        Start-Sleep -Seconds $PollSeconds
    }
}

Export-ModuleMember -Function @(
    'Get-DeployForgeAgentWingetInfo'
    'Get-DeployForgeAgentHeartbeat'
    'Invoke-DeployForgeAgentOperation'
    'Start-DeployForgeAgent'
)
