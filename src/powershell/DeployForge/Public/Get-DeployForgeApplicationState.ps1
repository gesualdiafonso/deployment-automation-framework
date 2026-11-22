function Get-DeployForgeApplicationState {
    <#
    .SYNOPSIS
        Detects whether a catalog application is installed. Read-only: runs only 'winget list'.
    .DESCRIPTION
        Uses the same plan validation and detection as Invoke-DeployForgeDeployment, without
        changing anything on the machine. Throws when the application is unknown, its source
        type is not supported, winget is unavailable, or detection fails.
    .EXAMPLE
        Get-DeployForgeApplicationState -Id 7zip
    #>
    [CmdletBinding()]
    [OutputType('DeployForge.ApplicationState')]
    param(
        [Parameter(Mandatory, Position = 0)]
        [string]$Id,

        [string]$RepositoryRoot = $script:DeployForgeRoot
    )

    $plan = Get-DeployForgeDeploymentPlan -Id $Id -RepositoryRoot $RepositoryRoot

    if (-not $plan.Supported) {
        throw "Cannot detect '$Id': $($plan.Notes -join ' ')"
    }

    $installed = Test-DeployForgeApplicationInstalled -PackageId $plan.PackageId -Source $plan.SourceType

    [pscustomobject]@{
        PSTypeName = 'DeployForge.ApplicationState'
        Id         = $plan.Id
        Name       = $plan.Name
        PackageId  = $plan.PackageId
        Source     = $plan.SourceType
        Installed  = $installed
        CheckedAt  = [DateTimeOffset]::UtcNow
    }
}
