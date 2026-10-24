function Read-DeployForgeCatalog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$RepositoryRoot
    )

    $catalogPath = Join-Path $RepositoryRoot 'packages/catalog.json'

    if (-not (Test-Path -LiteralPath $catalogPath -PathType Leaf)) {
        throw "Catalog not found: $catalogPath"
    }

    try {
        Get-Content -LiteralPath $catalogPath -Raw -Encoding utf8 |
            ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        throw "Catalog is not valid JSON ($catalogPath): $($_.Exception.Message)"
    }
}