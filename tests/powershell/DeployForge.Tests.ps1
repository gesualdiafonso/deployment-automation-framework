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

    It 'throws when the catalog file is missing' {
        { Get-DeployForgeApplication -RepositoryRoot $TestDrive } |
            Should -Throw -ExpectedMessage '*Catalog not found*'
    }
}

Describe 'Get-DeployForgeDeploymentPlan' {
    It 'builds a silent winget command' {
        $root = Build-TestRepository -Applications @(Build-TestApp)
        $plan = Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root

        $plan.Supported | Should -BeTrue
        $plan.Command | Should -Be 'winget install --id Vendor.App --exact --source winget --silent --accept-package-agreements --accept-source-agreements --disable-interactivity'
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

    It 'builds a supported plan for every application in the real catalog' {
        foreach ($app in Get-DeployForgeApplication) {
            $plan = Get-DeployForgeDeploymentPlan -Id $app.id
            $plan.Supported | Should -BeTrue -Because "$($app.id) must be deployable"
        }
    }
}

Describe 'Invoke-DeployForgeDeployment' {
    BeforeEach {
        # Default: application not installed (winget list exit code 0x8A150014) and install succeeds.
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -ParameterFilter { $Arguments[0] -eq 'list' } -MockWith {
            [pscustomobject]@{ ExitCode = -1978335212; Output = @() }
        }
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -ParameterFilter { $Arguments[0] -eq 'install' } -MockWith {
            [pscustomobject]@{ ExitCode = 0; Output = @('Successfully installed') }
        }
    }

    It 'returns DryRun with -WhatIf and runs nothing' {
        $logDir = Join-Path $TestDrive 'logs'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -WhatIf

        $result.Status | Should -Be 'DryRun'
        $result.LogPath | Should -BeNullOrEmpty
        Should -Invoke Invoke-DeployForgeWinget -ModuleName DeployForge -Times 0 -Exactly
        Test-Path -LiteralPath $logDir | Should -BeFalse
    }

    It 'installs an application that is not installed' {
        $logDir = Join-Path $TestDrive 'logs'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -Confirm:$false

        $result.Status | Should -Be 'Installed'
        $result.ExitCode | Should -Be 0
        Should -Invoke Invoke-DeployForgeWinget -ModuleName DeployForge -Times 1 -Exactly -ParameterFilter { $Arguments[0] -eq 'install' }
    }

    It 'does not reinstall an application that is already installed' {
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -ParameterFilter { $Arguments[0] -eq 'list' } -MockWith {
            [pscustomobject]@{ ExitCode = 0; Output = @('Google Chrome') }
        }
        $logDir = Join-Path $TestDrive 'logs'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -Confirm:$false

        $result.Status | Should -Be 'AlreadyInstalled'
        Should -Invoke Invoke-DeployForgeWinget -ModuleName DeployForge -Times 0 -Exactly -ParameterFilter { $Arguments[0] -eq 'install' }
    }

    It 'returns Failed when winget install exits with an error code' {
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -ParameterFilter { $Arguments[0] -eq 'install' } -MockWith {
            [pscustomobject]@{ ExitCode = 1; Output = @('Installer failed') }
        }
        $logDir = Join-Path $TestDrive 'logs'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -Confirm:$false -WarningAction SilentlyContinue

        $result.Status | Should -Be 'Failed'
        $result.ExitCode | Should -Be 1
        $result.Message | Should -Match 'exit code 1'
    }

    It 'returns Failed without installing when detection fails unexpectedly' {
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -ParameterFilter { $Arguments[0] -eq 'list' } -MockWith {
            [pscustomobject]@{ ExitCode = 5; Output = @() }
        }
        $logDir = Join-Path $TestDrive 'logs'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -Confirm:$false -WarningAction SilentlyContinue

        $result.Status | Should -Be 'Failed'
        $result.Message | Should -Match 'winget list failed'
        Should -Invoke Invoke-DeployForgeWinget -ModuleName DeployForge -Times 0 -Exactly -ParameterFilter { $Arguments[0] -eq 'install' }
    }

    It 'returns Failed when winget is not available' {
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -ParameterFilter { $Arguments[0] -eq 'list' } -MockWith {
            throw 'winget was not found on this machine.'
        }
        $logDir = Join-Path $TestDrive 'logs'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -Confirm:$false -WarningAction SilentlyContinue

        $result.Status | Should -Be 'Failed'
        $result.Message | Should -Match 'not found'
    }

    It 'writes a log file that records the outcome' {
        Mock Invoke-DeployForgeWinget -ModuleName DeployForge -ParameterFilter { $Arguments[0] -eq 'list' } -MockWith {
            [pscustomobject]@{ ExitCode = 0; Output = @('Google Chrome') }
        }
        $logDir = Join-Path $TestDrive 'logs'

        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -LogDirectory $logDir -Confirm:$false

        Test-Path -LiteralPath $result.LogPath | Should -BeTrue
        $content = Get-Content -LiteralPath $result.LogPath -Raw
        $content | Should -Match $result.OperationId
        $content | Should -Match 'AlreadyInstalled'
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
}