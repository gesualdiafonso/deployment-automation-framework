function Invoke-DeployForgeWinget {
    [CmdletBinding()]
    [OutputType([pscustomobject])]
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    if (-not $IsWindows) {
        throw 'winget is only available on Windows.'
    }

    $winget = Get-Command -Name 'winget' -CommandType Application -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw 'winget was not found on this machine.'
    }

    $output = @(
        & $winget.Source @Arguments 2>&1 |
            ForEach-Object { $_.ToString().TrimEnd() } |
            Where-Object { $_ -notmatch '^[-\\|/]?$' }
    )
    $exitCode = $LASTEXITCODE

    [pscustomobject]@{
        ExitCode = $exitCode
        Output   = $output
    }
}
