#Requires -Version 7.2
<#
.SYNOPSIS
    Runs a real install / uninstall lifecycle with WinGet and records the evidence.

.DESCRIPTION
    For each application, runs four phases and checks the status of each one:

        1. Install    -> Installed          (first install)
        2. Install    -> AlreadyInstalled   (idempotency)
        3. Uninstall  -> Uninstalled
        4. Uninstall  -> NotInstalled       (idempotency)

    SAFETY
      * It really installs and uninstalls software. It refuses to run unless it detects
        Windows Sandbox (user WDAGUtilityAccount) or you pass -AllowRealInstall.
      * If an application is ALREADY installed before phase 1, that application is skipped
        and never uninstalled: this script only removes what it installed itself.

    OUTPUT (in -OutputDirectory)
        summary.json, summary.csv   one row per phase
        logs\                       one DeployForge log per operation
        transcript.txt              full console transcript

    Exit code: 0 when every phase matched, 1 otherwise, 2 when it could not start.

.PARAMETER Id
    Catalog application IDs. Accepts an array or one comma-separated string.

.EXAMPLE
    # Inside a disposable VM or Windows Sandbox:
    .\tools\Test-DeployForgeLifecycle.ps1 -Id 7zip -AllowRealInstall
#>
[CmdletBinding()]
param(
    [string[]]$Id = @('7zip', 'git', 'visual-studio-code'),

    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,

    [string]$OutputDirectory,

    [switch]$AllowRealInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $IsWindows) {
    Write-Error 'The lifecycle test only runs on Windows.'
    exit 2
}

$inSandbox = ($env:USERNAME -eq 'WDAGUtilityAccount')
if (-not $inSandbox -and -not $AllowRealInstall) {
    Write-Error ('This script really installs and uninstalls software. Run it inside Windows Sandbox or a ' +
        'disposable VM, or pass -AllowRealInstall if you accept that on this machine.')
    exit 2
}

if (-not (Get-Command -Name 'winget' -CommandType Application -ErrorAction SilentlyContinue)) {
    Write-Error 'winget was not found on this machine.'
    exit 2
}

$Id = @($Id | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($Id.Count -eq 0) {
    Write-Error 'No application IDs were provided.'
    exit 2
}

if (-not $PSBoundParameters.ContainsKey('OutputDirectory')) {
    $OutputDirectory = Join-Path $RepositoryRoot ('logs/lifecycle-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
$null = New-Item -ItemType Directory -Path $OutputDirectory -Force
$logDirectory = Join-Path $OutputDirectory 'logs'

Start-Transcript -Path (Join-Path $OutputDirectory 'transcript.txt') | Out-Null

try {
    Import-Module (Join-Path $RepositoryRoot 'src/powershell/DeployForge/DeployForge.psd1') -Force

    $phases = @(
        @{ Action = 'Install';   Expected = 'Installed' }
        @{ Action = 'Install';   Expected = 'AlreadyInstalled' }
        @{ Action = 'Uninstall'; Expected = 'Uninstalled' }
        @{ Action = 'Uninstall'; Expected = 'NotInstalled' }
    )

    $rows = [System.Collections.Generic.List[object]]::new()

    foreach ($appId in $Id) {
        Write-Host ''
        Write-Host "=== $appId ===" -ForegroundColor Cyan

        $number = 0
        foreach ($phase in $phases) {
            $number++
            $started = Get-Date
            $status = $null; $verified = $null; $exitCode = $null; $logPath = $null; $message = $null

            try {
                $result = Invoke-DeployForgeDeployment -Id $appId -Action $phase.Action `
                    -LogDirectory $logDirectory -Confirm:$false
                $status = $result.Status; $verified = $result.Verified; $exitCode = $result.ExitCode
                $logPath = $result.LogPath; $message = $result.Message
            }
            catch {
                $status = 'Error'
                $message = $_.Exception.Message
            }

            $preinstalled = ($number -eq 1 -and $status -eq 'AlreadyInstalled')
            $match = ($status -eq $phase.Expected)

            $rows.Add([pscustomobject]@{
                Id              = $appId
                Phase           = $number
                Action          = $phase.Action
                Expected        = $phase.Expected
                Status          = $(if ($preinstalled) { 'SkippedPreinstalled' } else { $status })
                Match           = $(if ($preinstalled) { $null } else { $match })
                Verified        = $verified
                ExitCode        = $exitCode
                DurationSeconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
                LogPath         = $logPath
                Message         = $(if ($preinstalled) { 'Already installed before the test; left untouched.' } else { $message })
            })

            $last = $rows[$rows.Count - 1]
            $color = if ($preinstalled) { 'Yellow' } elseif ($match) { 'Green' } else { 'Red' }
            Write-Host ("  phase {0}: {1,-9} expected {2,-16} got {3,-19} {4}" -f $number, $phase.Action, $phase.Expected, $last.Status, $(if ($match) { 'OK' } elseif ($preinstalled) { 'SKIPPED' } else { 'MISMATCH' })) -ForegroundColor $color

            # Never continue when the state is unknown or when we did not install it ourselves.
            if ($preinstalled -or -not $match) { break }
        }
    }

    $rows | Export-Csv -Path (Join-Path $OutputDirectory 'summary.csv') -NoTypeInformation -Encoding utf8
    $rows | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $OutputDirectory 'summary.json') -Encoding utf8

    $mismatches = @($rows | Where-Object { $_.Match -eq $false }).Count
    $skipped    = @($rows | Where-Object { $_.Status -eq 'SkippedPreinstalled' }).Count

    Write-Host ''
    Write-Host ("Phases run: {0}. Mismatches: {1}. Skipped (pre-installed): {2}." -f $rows.Count, $mismatches, $skipped)
    Write-Host "Evidence saved in: $OutputDirectory"
    if ($mismatches -eq 0) { $exit = 0 } else { $exit = 1 }
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $exit = 2
}
finally {
    Stop-Transcript | Out-Null
}

exit $exit
