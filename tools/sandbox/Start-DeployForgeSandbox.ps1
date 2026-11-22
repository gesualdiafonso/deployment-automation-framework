<#
.SYNOPSIS
    Opens Windows Sandbox and runs the install/uninstall lifecycle test inside it, unattended.

.DESCRIPTION
    Creates a .wsb configuration with absolute paths for this machine, maps the repository (read-only) and
    a results folder (writable), and launches the Sandbox. When it finishes, the evidence is in
    <repo>\logs\sandbox-<timestamp>\ on the host. Close the Sandbox window to discard everything installed.

    Requires Windows Sandbox (Windows 11 Pro/Enterprise/Education). Enable it once, as administrator:
        Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All

.PARAMETER Id
    Catalog application IDs to test. Accepts an array or one comma-separated string.
#>
[CmdletBinding()]
param(
    [string[]]$Id = @('7zip', 'git', 'visual-studio-code'),

    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'

$sandboxExe = Join-Path $env:windir 'System32\WindowsSandbox.exe'
if (-not (Test-Path $sandboxExe)) {
    throw ('Windows Sandbox is not enabled. Run this once in an administrator PowerShell and restart: ' +
        'Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All')
}

if (Get-Process -Name 'WindowsSandboxClient', 'WindowsSandboxRemoteSession' -ErrorAction SilentlyContinue) {
    throw 'A Windows Sandbox session is already running. Close it first (only one can run at a time).'
}

$apps = @($Id | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

$stamp   = Get-Date -Format 'yyyyMMdd-HHmmss'
$outHost = Join-Path $RepositoryRoot "logs\sandbox-$stamp"
New-Item -ItemType Directory -Path $outHost -Force | Out-Null
Set-Content -Path (Join-Path $outHost 'apps.txt') -Value ($apps -join "`r`n") -Encoding ASCII

$repoXml = [Security.SecurityElement]::Escape($RepositoryRoot)
$outXml  = [Security.SecurityElement]::Escape($outHost)

$config = @"
<Configuration>
  <VGpu>Disable</VGpu>
  <Networking>Enable</Networking>
  <MemoryInMB>4096</MemoryInMB>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$repoXml</HostFolder>
      <SandboxFolder>C:\DeployForge</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
    <MappedFolder>
      <HostFolder>$outXml</HostFolder>
      <SandboxFolder>C:\DeployForgeOut</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\DeployForge\tools\sandbox\Invoke-SandboxEntry.ps1</Command>
  </LogonCommand>
</Configuration>
"@

$wsbPath = Join-Path $outHost 'DeployForge.wsb'
Set-Content -Path $wsbPath -Value $config -Encoding UTF8

Write-Host "Applications : $($apps -join ', ')"
Write-Host "Results will appear in: $outHost"
Write-Host 'Starting Windows Sandbox. Wait for RESULT.txt to appear in that folder (a few minutes).'
Start-Process -FilePath $sandboxExe -ArgumentList ('"' + $wsbPath + '"')
