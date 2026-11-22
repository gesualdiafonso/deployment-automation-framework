<#
    Runs INSIDE Windows Sandbox, in Windows PowerShell 5.1, started by the LogonCommand of the .wsb file.

    It installs PowerShell 7 (portable zip) and WinGet (App Installer) when they are missing, then runs
    tools\Test-DeployForgeLifecycle.ps1 and writes everything to C:\DeployForgeOut, which is mapped to a
    folder on the host (logs\sandbox-<timestamp>).

    UNVERIFIED: the WinGet bootstrap depends on Microsoft download links and on the Sandbox image. If it
    fails, the reason is written to RESULT.txt and sandbox.log, and you can run the lifecycle script in a
    Hyper-V VM instead.
#>
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = 'C:\DeployForge'
$out  = 'C:\DeployForgeOut'
$work = 'C:\Work'
$pwshVersion = '7.4.6'
$logFile = Join-Path $out 'sandbox.log'

function Write-Step {
    param([string]$Message)
    $line = '{0} {1}' -f (Get-Date -Format 'HH:mm:ss'), $Message
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

function Initialize-Winget {
    $env:PATH = "$env:LOCALAPPDATA\Microsoft\WindowsApps;$env:PATH"
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Step 'winget already available.'
        return
    }

    Write-Step 'winget not found; installing App Installer and its dependencies.'
    $vclibs = Join-Path $work 'Microsoft.VCLibs.x64.14.00.Desktop.appx'
    $xaml   = Join-Path $work 'Microsoft.UI.Xaml.2.8.x64.appx'
    $bundle = Join-Path $work 'Microsoft.DesktopAppInstaller.msixbundle'

    Invoke-WebRequest -UseBasicParsing -Uri 'https://aka.ms/Microsoft.VCLibs.x64.14.00.Desktop.appx' -OutFile $vclibs
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/microsoft/microsoft-ui-xaml/releases/download/v2.8.6/Microsoft.UI.Xaml.2.8.x64.appx' -OutFile $xaml
    Invoke-WebRequest -UseBasicParsing -Uri 'https://aka.ms/getwinget' -OutFile $bundle

    Add-AppxPackage -Path $vclibs
    Add-AppxPackage -Path $xaml
    Add-AppxPackage -Path $bundle

    $env:PATH = "$env:LOCALAPPDATA\Microsoft\WindowsApps;$env:PATH"
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw 'winget is still not available after installing App Installer.'
    }
    Write-Step ('winget installed: ' + (& winget --version))
}

try {
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    Write-Step 'Sandbox entry script started.'

    # Applications to test (written by Start-DeployForgeSandbox.ps1).
    $appsFile = Join-Path $out 'apps.txt'
    $apps = '7zip'
    if (Test-Path $appsFile) {
        $apps = (Get-Content $appsFile | Where-Object { $_.Trim() }) -join ','
    }
    Write-Step "Applications: $apps"

    # PowerShell 7 (portable zip, no installer).
    $pwsh = Join-Path $work 'pwsh\pwsh.exe'
    if (-not (Test-Path $pwsh)) {
        Write-Step "Downloading PowerShell $pwshVersion."
        $zip = Join-Path $work 'pwsh.zip'
        Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/PowerShell/PowerShell/releases/download/v$pwshVersion/PowerShell-$pwshVersion-win-x64.zip" -OutFile $zip
        Expand-Archive -Path $zip -DestinationPath (Join-Path $work 'pwsh') -Force
    }
    Write-Step ('PowerShell 7: ' + (& $pwsh -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'))

    Initialize-Winget

    Write-Step 'Running the lifecycle test.'
    & $pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'tools\Test-DeployForgeLifecycle.ps1') `
        -Id $apps -RepositoryRoot $repo -OutputDirectory (Join-Path $out 'lifecycle')
    $code = $LASTEXITCODE

    Write-Step "Lifecycle test finished with exit code $code."
    Set-Content -Path (Join-Path $out 'RESULT.txt') -Value "Lifecycle exit code: $code (0 = every phase matched). Details: lifecycle\summary.csv"
}
catch {
    Write-Step ('FAILED: ' + $_.Exception.Message)
    Set-Content -Path (Join-Path $out 'RESULT.txt') -Value ('FAILED before the lifecycle test finished: ' + $_.Exception.Message)
}
