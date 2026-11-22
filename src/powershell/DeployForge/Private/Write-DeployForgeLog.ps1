function Write-DeployForgeLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path,

        [Parameter(Mandatory)]
        [string]$Message,

        [ValidateSet('INFO', 'WARN', 'ERROR', 'DEBUG')]
        [string]$Level = 'INFO'
    )

    $timestamp = [DateTimeOffset]::UtcNow.ToString('o')

    # A log line that cannot be written must stop the caller: operations are never run unrecorded.
    try {
        Add-Content -LiteralPath $Path -Value "$timestamp [$Level] $Message" -Encoding utf8 -ErrorAction Stop
    }
    catch {
        throw "Could not write the DeployForge log '$Path': $($_.Exception.Message)"
    }
}
