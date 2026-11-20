function Invoke-DeployForgeDeployment {
    <#
    .SYNOPSIS
        Installs or uninstalls a catalog application with WinGet and returns a structured result.
    .DESCRIPTION
        Flow: resolve the plan, detect the current state, change it only if needed, then
        verify the new state with a second detection. Every step is logged.

        Status values:
          Installed        - installed; detection confirmed it afterwards.
          AlreadyInstalled - Install requested, but it was already installed; nothing changed.
          Uninstalled      - uninstalled; detection confirmed it is gone.
          NotInstalled     - Uninstall requested, but it was not installed; nothing changed.
          Failed           - runtime failure (winget error, detection error, or the verification
                             did not find the expected state). See Message, ExitCode and LogPath.
          DryRun           - -WhatIf: no command was executed and no log was written.
          Skipped          - the confirmation prompt was declined.

        Configuration errors (unknown application, unsupported source, unsafe values)
        are thrown before anything runs.
    .EXAMPLE
        Invoke-DeployForgeDeployment -Id 7zip -WhatIf
    .EXAMPLE
        Invoke-DeployForgeDeployment -Id 7zip -Confirm:$false
    .EXAMPLE
        Invoke-DeployForgeDeployment -Id 7zip -Action Uninstall -Confirm:$false
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    [OutputType('DeployForge.DeploymentResult')]
    param(
        [Parameter(Mandatory, Position = 0)]
        [string]$Id,

        [ValidateSet('Install', 'Uninstall')]
        [string]$Action = 'Install',

        [string]$RepositoryRoot = $script:DeployForgeRoot,

        [string]$LogDirectory
    )

    $plan = Get-DeployForgeDeploymentPlan -Id $Id -Action $Action -RepositoryRoot $RepositoryRoot

    if (-not $plan.Supported) {
        throw "Cannot deploy '$Id': $($plan.Notes -join ' ')"
    }

    if (-not $PSBoundParameters.ContainsKey('LogDirectory')) {
        $LogDirectory = Join-Path $RepositoryRoot 'logs'
    }

    $expectInstalled = ($Action -eq 'Install')
    $operationId = [guid]::NewGuid().ToString('N').Substring(0, 8)
    $startedAt   = [DateTimeOffset]::UtcNow
    $exitCode    = $null
    $verified    = $null
    $logPath     = $null

    if ($PSCmdlet.ShouldProcess($plan.Name, $plan.Command)) {
        $null = New-Item -ItemType Directory -Path $LogDirectory -Force
        $stamp   = $startedAt.ToString('yyyyMMddTHHmmssZ')
        $logPath = Join-Path $LogDirectory "$stamp-$($plan.Id)-$($Action.ToLowerInvariant())-$operationId.log"

        try {
            Write-DeployForgeLog -Path $logPath -Message "Operation $operationId started: action $Action for '$($plan.Id)' ($($plan.SourceType): $($plan.PackageId))."
            Write-DeployForgeLog -Path $logPath -Message "Planned command: $($plan.Command)"

            $installed = Test-DeployForgeApplicationInstalled -PackageId $plan.PackageId -Source $plan.SourceType
            Write-DeployForgeLog -Path $logPath -Message "Detected state before: installed=$installed."

            if ($installed -eq $expectInstalled) {
                if ($expectInstalled) {
                    $status  = 'AlreadyInstalled'
                    $message = 'Application is already installed; no changes were made.'
                }
                else {
                    $status  = 'NotInstalled'
                    $message = 'Application is not installed; nothing to uninstall.'
                }
            }
            else {
                Write-DeployForgeLog -Path $logPath -Message "Running winget $($Action.ToLowerInvariant())."
                $result   = Invoke-DeployForgeWinget -Arguments $plan.Arguments
                $exitCode = $result.ExitCode

                foreach ($line in $result.Output) {
                    Write-DeployForgeLog -Path $logPath -Level 'DEBUG' -Message "winget: $line"
                }

                if ($exitCode -ne 0) {
                    $status  = 'Failed'
                    $message = "winget $($Action.ToLowerInvariant()) failed with exit code $exitCode."
                }
                else {
                    $verified = Confirm-DeployForgeApplicationState -PackageId $plan.PackageId -Source $plan.SourceType -Expected $expectInstalled
                    Write-DeployForgeLog -Path $logPath -Message "Verification after $($Action.ToLowerInvariant()): matched=$verified."

                    if ($verified) {
                        if ($expectInstalled) {
                            $status  = 'Installed'
                            $message = 'Application installed and detected afterwards.'
                        }
                        else {
                            $status  = 'Uninstalled'
                            $message = 'Application uninstalled and no longer detected.'
                        }
                    }
                    else {
                        $status  = 'Failed'
                        $message = "winget reported success but verification failed: the application is still $(if ($expectInstalled) { 'not detected' } else { 'detected' })."
                    }
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
            Write-Warning "Deployment of '$Id' ($Action) failed: $message See log: $logPath"
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
        Action      = $Action
        Status      = $status
        Message     = $message
        ExitCode    = $exitCode
        Verified    = $verified
        Command     = $plan.Command
        LogPath     = $logPath
        StartedAt   = $startedAt
        Duration    = [DateTimeOffset]::UtcNow - $startedAt
    }
}
