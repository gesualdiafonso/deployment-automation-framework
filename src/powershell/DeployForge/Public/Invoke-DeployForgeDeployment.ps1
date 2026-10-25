function Invoke-DeployForgeDeployment {
    <#
    .SYNOPSIS
        Deploys a catalog application with WinGet and returns a structured result.
    .DESCRIPTION
        Flow: resolve the plan, detect whether the application is installed, install it
        if it is not, and log every step. Status values:
          Installed        - the application was installed (winget exit code 0).
          AlreadyInstalled - detection found it; nothing was changed.
          Failed           - a runtime failure; see Message, ExitCode and LogPath.
          DryRun           - -WhatIf: no command was executed and no log was written.
          Skipped          - the confirmation prompt was declined.
        Configuration errors (unknown application, unsupported source, unsafe values)
        are thrown before anything runs.
    .EXAMPLE
        Invoke-DeployForgeDeployment -Id 7zip -WhatIf
    .EXAMPLE
        Invoke-DeployForgeDeployment -Id 7zip -Confirm:$false
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    [OutputType('DeployForge.DeploymentResult')]
    param(
        [Parameter(Mandatory, Position = 0)]
        [string]$Id,

        [string]$RepositoryRoot = $script:DeployForgeRoot,

        [string]$LogDirectory
    )

    $plan = Get-DeployForgeDeploymentPlan -Id $Id -RepositoryRoot $RepositoryRoot

    if (-not $plan.Supported) {
        throw "Cannot deploy '$Id': $($plan.Notes -join ' ')"
    }

    if (-not $PSBoundParameters.ContainsKey('LogDirectory')) {
        $LogDirectory = Join-Path $RepositoryRoot 'logs'
    }

    $operationId = [guid]::NewGuid().ToString('N').Substring(0, 8)
    $startedAt   = [DateTimeOffset]::UtcNow
    $exitCode    = $null
    $logPath     = $null

    if ($PSCmdlet.ShouldProcess($plan.Name, $plan.Command)) {
        $null = New-Item -ItemType Directory -Path $LogDirectory -Force
        $stamp   = $startedAt.ToString('yyyyMMddTHHmmssZ')
        $logPath = Join-Path $LogDirectory "$stamp-$($plan.Id)-$operationId.log"

        try {
            Write-DeployForgeLog -Path $logPath -Message "Operation $operationId started for '$($plan.Id)' ($($plan.SourceType): $($plan.PackageId))."
            Write-DeployForgeLog -Path $logPath -Message "Planned command: $($plan.Command)"

            $installed = Test-DeployForgeApplicationInstalled -PackageId $plan.PackageId -Source $plan.SourceType

            if ($installed) {
                $status  = 'AlreadyInstalled'
                $message = 'Application is already installed; no changes were made.'
            }
            else {
                Write-DeployForgeLog -Path $logPath -Message 'Application not installed; running winget install.'
                $result   = Invoke-DeployForgeWinget -Arguments $plan.Arguments
                $exitCode = $result.ExitCode

                foreach ($line in $result.Output) {
                    Write-DeployForgeLog -Path $logPath -Level 'DEBUG' -Message "winget: $line"
                }

                if ($exitCode -eq 0) {
                    $status  = 'Installed'
                    $message = 'Application installed successfully.'
                }
                else {
                    $status  = 'Failed'
                    $message = "winget install failed with exit code $exitCode."
                }
            }
        }
        catch {
            $status  = 'Failed'
            $message = $_.Exception.Message
        }

        $level = if ($status -eq 'Failed') { 'ERROR' } else { 'INFO' }
        Write-DeployForgeLog -Path $logPath -Level $level -Message "Result: $status. $message"

        if ($status -eq 'Failed') {
            Write-Warning "Deployment of '$Id' failed: $message See log: $logPath"
        }
    }
    elseif ($WhatIfPreference) {
        $status  = 'DryRun'
        $message = 'Dry run: no command was executed.'
    }
    else {
        $status  = 'Skipped'
        $message = 'Operation was not confirmed.'
    }

    [pscustomobject]@{
        PSTypeName  = 'DeployForge.DeploymentResult'
        OperationId = $operationId
        Id          = $plan.Id
        Name        = $plan.Name
        Status      = $status
        Message     = $message
        ExitCode    = $exitCode
        Command     = $plan.Command
        LogPath     = $logPath
        StartedAt   = $startedAt
        Duration    = [DateTimeOffset]::UtcNow - $startedAt
    }
}