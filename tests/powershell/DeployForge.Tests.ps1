BeforeAll {
    $script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
    Import-Module (Join-Path $script:RepoRoot 'src/powershell/DeployForge/DeployForge.psd1') -Force

    function New-TestApp {
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

    function New-TestRepository {
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
            Should -Throw -ExpectedMessage "*was not found in the catalog*"
    }

    It 'throws when the catalog file is missing' {
        { Get-DeployForgeApplication -RepositoryRoot $TestDrive } |
            Should -Throw -ExpectedMessage '*Catalog not found*'
    }
}

Describe 'Get-DeployForgeDeploymentPlan' {
    It 'builds a winget command' {
        $root = New-TestRepository -Applications @(New-TestApp)
        $plan = Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root

        $plan.Supported | Should -BeTrue
        $plan.Command | Should -Be 'winget install --id Vendor.App --exact --source winget --accept-package-agreements --accept-source-agreements'
    }

    It 'uses the msstore source for Store packages' {
        $root = New-TestRepository -Applications @(New-TestApp -SourceType 'msstore' -PackageId '9NKSQGP7F2NH')
        $plan = Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root

        $plan.Command | Should -BeLike '*--id 9NKSQGP7F2NH*--source msstore*'
    }

    It 'pins the version when it is not latest or stable' {
        $root = New-TestRepository -Applications @(New-TestApp -Version '1.2.3')
        $plan = Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root

        $plan.Command | Should -BeLike '*--version 1.2.3'
    }

    It 'notes a missing entry_point without failing' {
        $root = New-TestRepository -Applications @(New-TestApp)
        $plan = Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root

        $plan.EntryPointExists | Should -BeFalse
        ($plan.Notes -join ' ') | Should -Match 'entry_point does not exist'
    }

    It 'detects an existing entry_point' {
        $root = New-TestRepository -Applications @(New-TestApp)
        New-Item -ItemType File -Force -Path (Join-Path $root 'packages/test/Deploy-Application.ps1') | Out-Null

        (Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root).EntryPointExists | Should -BeTrue
    }

    It 'marks unsupported source types instead of building a command' {
        $root = New-TestRepository -Applications @(New-TestApp -SourceType 'direct')
        $plan = Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root

        $plan.Supported | Should -BeFalse
        $plan.Command | Should -BeNullOrEmpty
    }

    It 'rejects an entry_point that escapes the repository' {
        $root = New-TestRepository -Applications @(New-TestApp -EntryPoint '../outside.ps1')

        { Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root } |
            Should -Throw -ExpectedMessage '*outside the repository*'
    }

    It 'rejects an absolute entry_point' {
        $root = New-TestRepository -Applications @(New-TestApp -EntryPoint 'C:\Windows\System32\cmd.exe')

        { Get-DeployForgeDeploymentPlan -Id 'test-app' -RepositoryRoot $root } |
            Should -Throw -ExpectedMessage '*relative path*'
    }

    It 'rejects a package_id with unsafe characters' {
        $root = New-TestRepository -Applications @(New-TestApp -PackageId 'Vendor.App; calc')

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
    It 'skips execution with -WhatIf' {
        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -WhatIf
        $result.Status | Should -Be 'Skipped'
    }

    It 'makes no changes without -WhatIf in this version' {
        $result = Invoke-DeployForgeDeployment -Id 'google-chrome' -Confirm:$false -WarningAction SilentlyContinue
        $result.Status | Should -Be 'NotExecuted'
    }

    It 'throws for an unknown application' {
        { Invoke-DeployForgeDeployment -Id 'does-not-exist' -WhatIf } |
            Should -Throw -ExpectedMessage '*was not found in the catalog*'
    }

    It 'throws for an unsupported source type' {
        $root = New-TestRepository -Applications @(New-TestApp -SourceType 'direct')

        { Invoke-DeployForgeDeployment -Id 'test-app' -RepositoryRoot $root -WhatIf } |
            Should -Throw -ExpectedMessage '*not supported*'
    }
}