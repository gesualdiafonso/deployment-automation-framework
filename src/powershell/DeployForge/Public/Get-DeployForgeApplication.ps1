function Get-DeployForgeApplication {
    <#
    .SYNOPSIS
        Returns applications from the DeployForge catalog.
    .EXAMPLE
        Get-DeployForgeApplication -Id google-chrome
    #>
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Position = 0)]
        [string]$Id,

        [string]$RepositoryRoot = $script:DeployForgeRoot
    )

    $catalog = Read-DeployForgeCatalog -RepositoryRoot $RepositoryRoot
    $applications = @($catalog.applications)

    if (-not $PSBoundParameters.ContainsKey('Id')) {
        return $applications
    }

    $match = $applications | Where-Object { $_.id -eq $Id }

    if (-not $match) {
        throw "Application '$Id' was not found in the catalog."
    }

    $match
}