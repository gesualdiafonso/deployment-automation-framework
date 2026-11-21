function Get-DeployForgeDeploymentPlan {
    <#
    .SYNOPSIS
        Builds the plan for installing or uninstalling a catalog application without executing anything.
    .EXAMPLE
        Get-DeployForgeDeploymentPlan -Id google-chrome | Format-List
    .EXAMPLE
        Get-DeployForgeDeploymentPlan -Id 7zip -Action Uninstall
    #>
    [CmdletBinding()]
    [OutputType('DeployForge.DeploymentPlan')]
    param(
        [Parameter(Mandatory, Position = 0)]
        [string]$Id,

        [ValidateSet('Install', 'Uninstall')]
        [string]$Action = 'Install',

        [string]$RepositoryRoot = $script:DeployForgeRoot
    )

    $safePattern = '^[A-Za-z0-9][A-Za-z0-9._+-]*$'
    $app = Get-DeployForgeApplication -Id $Id -RepositoryRoot $RepositoryRoot

    $sourceType = $app.source.type
    $packageId  = $app.source.package_id
    $entryPoint = $app.deployment.entry_point

    # These values become winget arguments or file paths. Pattern checks such as -notmatch
    # filter arrays instead of rejecting them, so the type is checked first.
    $fields = [ordered]@{
        'source.type'            = $sourceType
        'source.package_id'      = $packageId
        'version'                = $app.version
        'deployment.entry_point' = $entryPoint
    }
    foreach ($field in $fields.GetEnumerator()) {
        if ($field.Value -isnot [string] -or [string]::IsNullOrWhiteSpace($field.Value)) {
            throw "$($field.Key) for '$Id' must be a non-empty string."
        }
    }

    # entry_point is catalog data that becomes a file path: it must stay inside the repository.
    if ([System.IO.Path]::IsPathRooted($entryPoint)) {
        throw "entry_point for '$Id' must be a relative path: $entryPoint"
    }

    $rootFull   = [System.IO.Path]::GetFullPath($RepositoryRoot)
    $entryFull  = [System.IO.Path]::GetFullPath((Join-Path $rootFull $entryPoint))
    $rootPrefix = $rootFull.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

    if (-not $entryFull.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "entry_point for '$Id' resolves outside the repository: $entryPoint"
    }

    $notes     = [System.Collections.Generic.List[string]]::new()
    $arguments = $null
    $supported = $false

    switch ($sourceType) {
        { $_ -in 'winget', 'msstore' } {
            if ($packageId -notmatch $safePattern) {
                throw "package_id for '$Id' contains unsupported characters: $packageId"
            }

            if ($Action -eq 'Install') {
                $arguments = @(
                    'install', '--id', $packageId, '--exact', '--source', $sourceType,
                    '--silent', '--accept-package-agreements', '--accept-source-agreements',
                    '--disable-interactivity'
                )

                if ($app.version -notin 'latest', 'stable') {
                    if ($app.version -notmatch $safePattern) {
                        throw "version for '$Id' contains unsupported characters: $($app.version)"
                    }
                    $arguments += @('--version', $app.version)
                }
            }
            else {
                $arguments = @(
                    'uninstall', '--id', $packageId, '--exact', '--source', $sourceType,
                    '--silent', '--accept-source-agreements', '--disable-interactivity'
                )
            }

            $supported = $true
        }
        default {
            $notes.Add("Source type '$sourceType' is not supported by the engine yet.")
        }
    }

    $entryExists = Test-Path -LiteralPath $entryFull -PathType Leaf
    if (-not $entryExists) {
        $notes.Add('entry_point does not exist yet (metadata only in this phase).')
    }

    [pscustomobject]@{
        PSTypeName       = 'DeployForge.DeploymentPlan'
        Id               = $app.id
        Name             = $app.name
        Action           = $Action
        Version          = $app.version
        SourceType       = $sourceType
        PackageId        = $packageId
        DeploymentType   = $app.deployment.type
        EntryPoint       = $entryPoint
        EntryPointExists = $entryExists
        Supported        = $supported
        Command          = if ($supported) { 'winget ' + ($arguments -join ' ') } else { $null }
        Arguments        = $arguments
        Notes            = $notes.ToArray()
    }
}
