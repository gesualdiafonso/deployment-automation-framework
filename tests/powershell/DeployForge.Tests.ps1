BeforeAll {
    $script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
    Import-Module (Join-Path $script:RepoRoot 'src/powershell/DeployForge/DeployForge.psd1') -Force

    function Build-TestApp {
        param(
            [string]$Id = 'test-app',
            [string]$SourceType = 'winget',
            [string]$PackageId = 'Vendor.App',
            [string]$Version = 'latest',
            [string]$EntryPoint = 'packages/test/Deploy-Application.ps1'
        )
        @{
            id         = $Id
            name       = 'Test App'
            version    = $Version
            source     = @{ type = $SourceType; package_id = $PackageId }
            deployment = @{ type = 'powershell'; entry_point = $EntryPoint }
        }
    }

    function Build-TestRepository {
        param([Parameter(Mandatory)][object[]]$Applications)
        $root = Join-Path $TestDrive ([guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path (Join-Path $root 'packages') -Force | Out-Null
        @{ schema_version = '1.0'; applications = $Applications } |
            ConvertTo-Json -Depth 6 |
            Set-Content -LiteralPath (Join-Path $root 'packages/catalog.json') -Encoding utf8
        $root
    }
}

Describe 'Get-DeployForgeApplication' {
    It 'returns the applications of the real catalog' {
        @(Get-DeployForgeApplication).Count | Should -BeGreaterThan 0
    }

    It 'returns one application by id' {
        (Get-DeployForgeApplication -Id 'google-chrome').source.package_id | Should -Be 'Google.Chrome'
    }

    It 'throws for an unknown id' {
        { Get-DeployForgeApplication -Id 'does-not-exist' } |
            Should -Throw -ExpectedMessage '*was not found in the catalog*'
    }

    It 'throws when an application ID appears more than once in the catalog' {
        $root = Build-TestRepository -Applications @(
            (Build-TestApp -PackageId 'Vendor.A'),
            (Build-TestApp -PackageId 'Vendor.B')
        )

        { Get-DeployForgeApplication -Id 'test-app' -RepositoryRoot $root } |
            Should -Throw -ExpectedMessage '*appears 2 times*'
    }

    It 'throws when the catalog file is missing' {
        { Get-DeployForgeApplication -RepositoryRoot $TestDrive } |
            Should -Throw -ExpectedMessage '*Catalog not found*'
    }
}

Describe 'Get-DeployForgeDeploymentPlan' {
    It 'builds a silent winget install command by default' {
        $root = Build-TestRepository -Applications @(Build-TestApp)
        $plan = Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root

        $plan.Supported | Should -BeTrue
        $plan.Action | Should -Be 'Install'
        $plan.Command | Should -Be 'winget install --id Vendor.App --exact --source winget --silent --accept-package-agreements --accept-source-agreements --disable-interactivity'
    }

    It 'builds a silent winget uninstall command' {
        $root = Build-TestRepository -Applications @(Build-TestApp)
        $plan = Get-DeployForgeDeploymentPlan -Id 'test-app' -Action Uninstall -RepositoryRoot $root

        $plan.Supported | Should -BeTrue
        $plan.Action | Should -Be 'Uninstall'
        $plan.Command | Should -Be 'winget uninstall --id Vendor.App --exact --source winget --silent --accept-source-agreements --disable-interactivity'
    }

    It 'ignores a pinned version when uninstalling' {
        $root = Build-TestRepository -Applications @(Build-TestApp -Version '1.2.3')
        $plan = Get-DeployForgeDeploymentPlan -Id 'test-app' -Action Uninstall -RepositoryRoot $root

        $plan.Command | Should -Not -BeLike '*--version*'
    }

    It 'uses the msstore source for Store packages' {
        $root = Build-TestRepository -Applications @(Build-TestApp -SourceType 'msstore' -PackageId '9NKSQGP7F2NH')
        $plan = Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root

        $plan.Command | Should -BeLike '*--id 9NKSQGP7F2NH*--source msstore*'
    }

    It 'pins the version when it is not latest or stable' {
        $root = Build-TestRepository -Applications @(Build-TestApp -Version '1.2.3')
        $plan = Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root

        $plan.Command | Should -BeLike '*--version 1.2.3'
    }

    It 'notes a missing entry_point without failing' {
        $root = Build-TestRepository -Applications @(Build-TestApp)
        $plan = Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root

        $plan.EntryPointExists | Should -BeFalse
        ($plan.Notes -join ' ') | Should -Match 'entry_point does not exist'
    }

    It 'detects an existing entry_point' {
        $root = Build-TestRepository -Applications @(Build-TestApp)
        New-Item -ItemType File -Force -Path (Join-Path $root 'packages/test/Deploy-Application.ps1') | Out-Null

        (Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root).EntryPointExists | Should -BeTrue
    }

    It 'marks unsupported source types instead of building a command' {
        $root = Build-TestRepository -Applications @(Build-TestApp -SourceType 'direct')
        $plan = Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root

        $plan.Supported | Should -BeFalse
        $plan.Command | Should -BeNullOrEmpty
    }

    It 'rejects an entry_point that escapes the repository' {
        $root = Build-TestRepository -Applications @(Build-TestApp -EntryPoint '../outside.ps1')

        { Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root } |
            Should -Throw -ExpectedMessage '*outside the repository*'
    }

    It 'rejects an absolute entry_point' {
        $absolute = if ($IsWindows) { 'C:\Windows\System32\cmd.exe' } else { '/usr/bin/env' }
        $root = Build-TestRepository -Applications @(Build-TestApp -EntryPoint $absolute)

        { Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root } |
            Should -Throw -ExpectedMessage '*relative path*'
    }

    It 'rejects a package_id with unsafe characters' {
        $root = Build-TestRepository -Applications @(Build-TestApp -PackageId 'Vendor.App; calc')

        { Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root } |
            Should -Throw -ExpectedMessage '*unsupported characters*'
    }

    It 'rejects <Field> when it is <Case>' -ForEach @(
        @{ Field = 'source.package_id'; Case = 'an array of safe values'; Set = { param($a) $a.source.package_id = @('Vendor.A', 'Vendor.B') } }
        @{ Field = 'version';           Case = 'a number';                Set = { param($a) $a.version = 2 } }
        @{ Field = 'version';           Case = 'empty';                   Set = { param($a) $a.version = '' } }
        @{ Field = 'source.type';       Case = 'an array';                Set = { param($a) $a.source.type = @('winget', 'msstore') } }
        @{ Field = 'deployment.entry_point'; Case = 'an array';           Set = { param($a) $a.deployment.entry_point = @('a.ps1', 'b.ps1') } }
    ) {
        $app = Build-TestApp
        & $Set $app
        $root = Build-TestRepository -Applications @($app)

        { Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root } |
            Should -Throw -ExpectedMessage "$Field for 'test-app' must be a non-empty string."
    }

    It 'builds a supported install and uninstall plan for every application in the real catalog' {
        foreach ($app in Get-DeployForgeApplication) {
            (Get-DeployForgeDeploymentPlan -Id $app.id).Supported | Should -BeTrue -Because "$($app.id) must be installable"
            (Get-DeployForgeDeploymentPlan -Id $app.id -Action Uninstall).Supported | Should -BeTrue -Because "$($app.id) must be uninstallable"
        }
    }
}

Describe 'Test-DeployForgeApplicationInstalled' {
    # winget exit code -1978335212 (0x8A150014) means "no installed package found".
    It 'returns true when winget list succeeds' {
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @('Vendor App') } }

        InModuleScope DeployForge { Test-DeployForgeApplicationInstalled -PackageId 'Vendor.App' -Source winget } | Should -BeTrue
    }

    It 'returns false when winget finds no installed package' {
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = -1978335212; Output = @() } }

        InModuleScope DeployForge { Test-DeployForgeApplicationInstalled -PackageId 'Vendor.App' -Source winget } | Should -BeFalse
    }

    It 'throws on an unexpected exit code' {
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 5; Output = @() } }

        { InModuleScope DeployForge { Test-DeployForgeApplicationInstalled -PackageId 'Vendor.App' -Source winget } } |
            Should -Throw -ExpectedMessage '*winget list failed*'
    }
}

Describe 'Confirm-DeployForgeApplicationState' {
    It 'returns true when the detected state matches the expected one' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $true }

        InModuleScope DeployForge { Confirm-DeployForgeApplicationState -PackageId 'Vendor.App' -Source winget -Expected $true } | Should -BeTrue
    }

    It 'returns false when the detected state differs from the expected one' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $true }

        InModuleScope DeployForge { Confirm-DeployForgeApplicationState -PackageId 'Vendor.App' -Source winget -Expected $false } | Should -BeFalse
    }
}

# Every test below declares the mocks it needs, so no test depends on another mock overriding it.
#   Test-DeployForgeApplicationInstalled   = detection before the operation
#   Confirm-DeployForgeApplicationState    = verification after the operation
#   Invoke-DeployForgeWinget               = the only function that calls winget
Describe 'Write-DeployForgeLog' {
    It 'throws when the log file cannot be written' {
        $path = Join-Path $TestDrive 'missing-dir/sub/x.log'
        InModuleScope DeployForge -Parameters @{ Path = $path } {
            { Write-DeployForgeLog -Path $Path -Message 'm' } | Should -Throw -ExpectedMessage '*Could not write the DeployForge log*'
        }
    }
}

Describe 'Invoke-DeployForgeDeployment' {
    It 'returns DryRun with -WhatIf for an install and runs nothing' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $false }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $true }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @('winget output') } }
        $logDir = Join-Path $TestDrive 'logs-whatif-install'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -WhatIf

        $result.Status | Should -Be 'DryRun'
        $result.LogPath | Should -BeNullOrEmpty
        Should -Invoke Invoke-DeployForgeWinget -ModuleName DeployForge -Times 0 -Exactly
        Should -Invoke Test-DeployForgeApplicationInstalled -ModuleName DeployForge -Times 0 -Exactly
        Test-Path -LiteralPath $logDir | Should -BeFalse
    }

    It 'returns DryRun with -WhatIf for an uninstall and runs nothing' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $true }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $false }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @('winget output') } }
        $logDir = Join-Path $TestDrive 'logs-whatif-uninstall'

        $result = Invoke-DeployForgeDeployment -Id '7zip' -Action Uninstall -LogDirectory $logDir -WhatIf

        $result.Status | Should -Be 'DryRun'
        $result.Command | Should -BeLike 'winget uninstall*'
        Should -Invoke Invoke-DeployForgeWinget -ModuleName DeployForge -Times 0 -Exactly
        Test-Path -LiteralPath $logDir | Should -BeFalse
    }

    It 'installs an application that is not installed and verifies it' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $false }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $true }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @('winget output') } }
        $logDir = Join-Path $TestDrive 'logs-install'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -Confirm:$false

        $result.Status | Should -Be 'Installed'
        $result.Action | Should -Be 'Install'
        $result.Verified | Should -BeTrue
        $result.ExitCode | Should -Be 0
        Should -Invoke Invoke-DeployForgeWinget -ModuleName DeployForge -Times 1 -Exactly -ParameterFilter { $Arguments[0] -eq 'install' }
        Should -Invoke Confirm-DeployForgeApplicationState -ModuleName DeployForge -Times 1 -Exactly -ParameterFilter { $Expected -eq $true }
    }

    It 'does not reinstall an application that is already installed' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $true }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $true }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @('winget output') } }
        $logDir = Join-Path $TestDrive 'logs-already'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -Confirm:$false

        $result.Status | Should -Be 'AlreadyInstalled'
        Should -Invoke Invoke-DeployForgeWinget -ModuleName DeployForge -Times 0 -Exactly
    }

    It 'returns Failed when winget install exits with an error code' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $false }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $true }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 1; Output = @('winget output') } }
        $logDir = Join-Path $TestDrive 'logs-install-failed'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -Confirm:$false -WarningAction SilentlyContinue

        $result.Status | Should -Be 'Failed'
        $result.ExitCode | Should -Be 1
        $result.Message | Should -Match 'exit code 1'
        Should -Invoke Confirm-DeployForgeApplicationState -ModuleName DeployForge -Times 0 -Exactly
    }

    It 'returns Failed when winget install succeeds but the application is not detected afterwards' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $false }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $false }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @('winget output') } }
        $logDir = Join-Path $TestDrive 'logs-install-unverified'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -Confirm:$false -WarningAction SilentlyContinue

        $result.Status | Should -Be 'Failed'
        $result.Verified | Should -BeFalse
        $result.Message | Should -Match 'verification failed'
    }

    It 'uninstalls an installed application and verifies it is gone' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $true }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $true }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @('winget output') } }
        $logDir = Join-Path $TestDrive 'logs-uninstall'

        $result = Invoke-DeployForgeDeployment -Id '7zip' -Action Uninstall -LogDirectory $logDir -Confirm:$false

        $result.Status | Should -Be 'Uninstalled'
        $result.Action | Should -Be 'Uninstall'
        $result.Verified | Should -BeTrue
        Should -Invoke Invoke-DeployForgeWinget -ModuleName DeployForge -Times 1 -Exactly -ParameterFilter { $Arguments[0] -eq 'uninstall' }
        Should -Invoke Confirm-DeployForgeApplicationState -ModuleName DeployForge -Times 1 -Exactly -ParameterFilter { $Expected -eq $false }
    }

    It 'does nothing when uninstalling an application that is not installed' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $false }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $false }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @('winget output') } }
        $logDir = Join-Path $TestDrive 'logs-notinstalled'

        $result = Invoke-DeployForgeDeployment -Id '7zip' -Action Uninstall -LogDirectory $logDir -Confirm:$false

        $result.Status | Should -Be 'NotInstalled'
        Should -Invoke Invoke-DeployForgeWinget -ModuleName DeployForge -Times 0 -Exactly
    }

    It 'returns Failed when winget uninstall exits with an error code' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $true }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $false }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 1603; Output = @('winget output') } }
        $logDir = Join-Path $TestDrive 'logs-uninstall-failed'

        $result = Invoke-DeployForgeDeployment -Id '7zip' -Action Uninstall -LogDirectory $logDir -Confirm:$false -WarningAction SilentlyContinue

        $result.Status | Should -Be 'Failed'
        $result.ExitCode | Should -Be 1603
        $result.Message | Should -Match 'exit code 1603'
    }

    It 'returns Failed when winget uninstall succeeds but the application is still detected' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $true }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $false }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @('winget output') } }
        $logDir = Join-Path $TestDrive 'logs-uninstall-unverified'

        $result = Invoke-DeployForgeDeployment -Id '7zip' -Action Uninstall -LogDirectory $logDir -Confirm:$false -WarningAction SilentlyContinue

        $result.Status | Should -Be 'Failed'
        $result.Verified | Should -BeFalse
        $result.Message | Should -Match 'still detected'
    }

    It 'returns Failed without running winget when detection fails' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { throw 'winget was not found on this machine.' }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $true }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @('winget output') } }
        $logDir = Join-Path $TestDrive 'logs-detect-failed'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -Confirm:$false -WarningAction SilentlyContinue

        $result.Status | Should -Be 'Failed'
        $result.Message | Should -Match 'not found'
        Should -Invoke Invoke-DeployForgeWinget -ModuleName DeployForge -Times 0 -Exactly
    }

    It 'writes a log file that records the action and the outcome' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $true }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $true }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @('winget output') } }
        $logDir = Join-Path $TestDrive 'logs-content'

        $result = Invoke-DeployForgeDeployment -Id '7zip' -Action Uninstall -LogDirectory $logDir -Confirm:$false

        Test-Path -LiteralPath $result.LogPath | Should -BeTrue
        Split-Path $result.LogPath -Leaf | Should -BeLike '*-7zip-uninstall-*.log'
        $content = Get-Content -LiteralPath $result.LogPath -Raw
        $content | Should -Match $result.OperationId
        $content | Should -Match 'action Uninstall'
        $content | Should -Match 'Result: Uninstalled'
    }

    It 'records in the log whether the session is elevated' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $true }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @() } }
        $logDir = Join-Path $TestDrive 'logs-elevation'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -Confirm:$false

        Get-Content -LiteralPath $result.LogPath -Raw | Should -Match 'Session elevated: (True|False|n/a)\.'
    }

    It 'returns Failed and runs nothing when the log directory cannot be created' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $false }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $true }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @() } }
        $blocker = Join-Path $TestDrive 'log-dir-is-a-file'
        Set-Content -LiteralPath $blocker -Value 'not a directory'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $blocker -Confirm:$false -WarningAction SilentlyContinue

        $result.Status | Should -Be 'Failed'
        $result.LogPath | Should -BeNullOrEmpty
        Should -Invoke Test-DeployForgeApplicationInstalled -ModuleName DeployForge -Times 0 -Exactly
        Should -Invoke Invoke-DeployForgeWinget -ModuleName DeployForge -Times 0 -Exactly
    }

    It 'returns Failed without running winget when the log cannot be written mid-operation' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $false }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $true }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @() } }
        Mock Write-DeployForgeLog -ModuleName DeployForge -MockWith { }
        Mock Write-DeployForgeLog -ModuleName DeployForge -ParameterFilter { $Message -like 'Detected state before*' } -MockWith { throw 'disk full' }
        $logDir = Join-Path $TestDrive 'logs-midway'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -Confirm:$false -WarningAction SilentlyContinue

        $result.Status | Should -Be 'Failed'
        $result.Message | Should -Match 'disk full'
        Should -Invoke Invoke-DeployForgeWinget -ModuleName DeployForge -Times 0 -Exactly
    }

    It 'still returns the result when only the final log line cannot be written' {
        Mock Test-DeployForgeApplicationInstalled -ModuleName DeployForge -MockWith { $false }
        Mock Confirm-DeployForgeApplicationState -ModuleName DeployForge -MockWith { $true }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -MockWith { [pscustomobject]@{ ExitCode = 0; Output = @() } }
        Mock Write-DeployForgeLog -ModuleName DeployForge -MockWith { }
        Mock Write-DeployForgeLog -ModuleName DeployForge -ParameterFilter { $Message -like 'Result:*' } -MockWith { throw 'disk full' }
        $logDir = Join-Path $TestDrive 'logs-final-line'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -Confirm:$false -WarningVariable warnings -WarningAction SilentlyContinue

        $result.Status | Should -Be 'Installed'
        $warnings | Should -Not -BeNullOrEmpty
    }

    It 'throws for an unknown application' {
        { Invoke-DeployForgeDeployment -Id 'does-not-exist' -WhatIf } |
            Should -Throw -ExpectedMessage '*was not found in the catalog*'
    }

    It 'throws for an unsupported source type' {
        $root = Build-TestRepository -Applications @(Build-TestApp -SourceType 'direct')

        { Invoke-DeployForgeDeployment -Id 'test-app' -RepositoryRoot $root -WhatIf } |
            Should -Throw -ExpectedMessage '*not supported*'
    }

    It 'rejects an unknown action' {
        { Invoke-DeployForgeDeployment -Id 'google-chrome' -Action 'Repair' -WhatIf } | Should -Throw
    }
}
