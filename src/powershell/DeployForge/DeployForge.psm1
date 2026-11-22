Set-StrictMode -Version Latest

# Module lives in <repo>/src/powershell/DeployForge, so the repo root is three levels up.
$script:DeployForgeRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))

foreach ($folder in 'Private', 'Public') {
    foreach ($file in Get-ChildItem -Path (Join-Path $PSScriptRoot $folder) -Filter '*.ps1' -File) {
        . $file.FullName
    }
}