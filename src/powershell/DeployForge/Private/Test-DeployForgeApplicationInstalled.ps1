function Test-DeployForgeApplicationInstalled {
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)]
        [string]$PackageId,

        [Parameter(Mandatory)]
        [ValidateSet('winget', 'msstore')]
        [string]$Source
    )

    # Exit code winget uses when no installed package matches (0x8A150014).
    $noApplicationsFound = -1978335212

    $result = Invoke-DeployForgeWinget -Arguments @(
        'list', '--id', $PackageId, '--exact', '--source', $Source,
        '--accept-source-agreements', '--disable-interactivity'
    )

    if ($result.ExitCode -eq 0) {
        return $true
    }

    if ($result.ExitCode -eq $noApplicationsFound) {
        return $false
    }

    throw "winget list failed with exit code $($result.ExitCode)."
}
