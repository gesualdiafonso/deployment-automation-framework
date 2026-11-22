BeforeAll {
    $script:RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
    Import-Module (Join-Path $script:RepoRoot 'src/powershell/DeployForgeAgent/DeployForgeAgent.psd1') -Force

    function Build-TestOperation {
        param([string]$Id = '7zip', [string]$Action = 'install', [AllowNull()][object]$Mode = 'dry_run')
        [pscustomobject]@{ operation_id = 'op-1'; application_id = $Id; action = $Action; mode = $Mode }
    }
}

Describe 'Invoke-DeployForgeAgentOperation' {
    BeforeEach {
        Mock Invoke-DeployForgeDeployment -ModuleName DeployForgeAgent -MockWith {
            [pscustomobject]@{ OperationId = '1a2b3c4d'; Status = 'DryRun'; Message = 'Dry run: no command was executed.'; ExitCode = $null; Verified = $null; LogPath = $null }
        }
        Mock Get-DeployForgeApplicationState -ModuleName DeployForgeAgent -MockWith {
            [pscustomobject]@{ Id = '7zip'; Name = '7-Zip'; Installed = $true }
        }
    }

    It 'runs dry_run through the engine with -WhatIf' {
        $report = Invoke-DeployForgeAgentOperation -Operation (Build-TestOperation) -AllowExecute $true

        $report.result.engine_status | Should -Be 'DryRun'
        $report.result.engine_operation_id | Should -Be '1a2b3c4d'
        Should -Invoke Invoke-DeployForgeDeployment -ModuleName DeployForgeAgent -Times 1 -Exactly -ParameterFilter {
            $Id -eq '7zip' -and $Action -eq 'Install' -and $WhatIf
        }
    }

    It 'maps uninstall to the engine Uninstall action' {
        $null = Invoke-DeployForgeAgentOperation -Operation (Build-TestOperation -Action 'uninstall')
        Should -Invoke Invoke-DeployForgeDeployment -ModuleName DeployForgeAgent -Times 1 -Exactly -ParameterFilter { $Action -eq 'Uninstall' -and $WhatIf }
    }

    It 'refuses execute when the agent does not allow it, without calling the engine' {
        $report = Invoke-DeployForgeAgentOperation -Operation (Build-TestOperation -Mode 'execute') -AllowExecute $false

        $report.error | Should -BeLike '*disabled*'
        Should -Invoke Invoke-DeployForgeDeployment -ModuleName DeployForgeAgent -Times 0 -Exactly
    }

    It 'runs execute only when allowed, and reports the exit code and only the log file name' {
        Mock Invoke-DeployForgeDeployment -ModuleName DeployForgeAgent -MockWith {
            [pscustomobject]@{
                OperationId = '1a2b3c4d'; Status = 'Installed'; Message = 'Application installed and detected afterwards.'
                ExitCode = 0; Verified = $true; LogPath = 'C:\repo\logs\20261121T120000Z-7zip-install-1a2b3c4d.log'
            }
        }

        $report = Invoke-DeployForgeAgentOperation -Operation (Build-TestOperation -Mode 'execute') -AllowExecute $true

        $report.result.engine_status | Should -Be 'Installed'
        $report.result.exit_code | Should -Be 0
        $report.result.verified | Should -BeTrue
        $report.result.log_file | Should -Be '20261121T120000Z-7zip-install-1a2b3c4d.log'
        Should -Invoke Invoke-DeployForgeDeployment -ModuleName DeployForgeAgent -Times 1 -Exactly -ParameterFilter { -not $WhatIf }
    }

    It 'refuses <Name> without calling the engine' -ForEach @(
        @{ Name = 'an ID with a path'; Operation = @{ Id = '..\evil'; Action = 'install'; Mode = 'dry_run' } }
        @{ Name = 'an uppercase ID'; Operation = @{ Id = 'Google.Chrome'; Action = 'install'; Mode = 'dry_run' } }
        @{ Name = 'an unknown action'; Operation = @{ Id = '7zip'; Action = 'repair'; Mode = 'dry_run' } }
        @{ Name = 'a command as action'; Operation = @{ Id = '7zip'; Action = 'install; calc.exe'; Mode = 'dry_run' } }
        @{ Name = 'an unknown mode'; Operation = @{ Id = '7zip'; Action = 'install'; Mode = 'now' } }
        @{ Name = 'a missing mode'; Operation = @{ Id = '7zip'; Action = 'install'; Mode = $null } }
        @{ Name = 'detect with a mode'; Operation = @{ Id = '7zip'; Action = 'detect'; Mode = 'execute' } }
    ) {
        $report = Invoke-DeployForgeAgentOperation -Operation (Build-TestOperation @Operation) -AllowExecute $true

        $report.error | Should -BeLike 'Refused*'
        Should -Invoke Invoke-DeployForgeDeployment -ModuleName DeployForgeAgent -Times 0 -Exactly
        Should -Invoke Get-DeployForgeApplicationState -ModuleName DeployForgeAgent -Times 0 -Exactly
    }

    It 'runs detect with the read-only engine function' {
        $report = Invoke-DeployForgeAgentOperation -Operation (Build-TestOperation -Action 'detect' -Mode $null)

        $report.result.detected_installed | Should -BeTrue
        $report.result.engine_status | Should -BeNullOrEmpty
        Should -Invoke Get-DeployForgeApplicationState -ModuleName DeployForgeAgent -Times 1 -Exactly -ParameterFilter { $Id -eq '7zip' }
        Should -Invoke Invoke-DeployForgeDeployment -ModuleName DeployForgeAgent -Times 0 -Exactly
    }

    It 'turns an engine exception into an error report' {
        Mock Invoke-DeployForgeDeployment -ModuleName DeployForgeAgent -MockWith { throw 'winget was not found on this machine.' }

        (Invoke-DeployForgeAgentOperation -Operation (Build-TestOperation)).error | Should -Be 'winget was not found on this machine.'
    }

    It 'truncates long messages to 2000 characters' {
        Mock Invoke-DeployForgeDeployment -ModuleName DeployForgeAgent -MockWith { throw ('x' * 5000) }

        (Invoke-DeployForgeAgentOperation -Operation (Build-TestOperation)).error.Length | Should -Be 2000
    }
}

Describe 'Get-DeployForgeAgentHeartbeat' {
    It 'reports exactly the fields the API expects' {
        $heartbeat = Get-DeployForgeAgentHeartbeat -AgentId 'agent-1' -Winget @{ available = $true; version = 'v1' } -ExecuteEnabled $false

        @($heartbeat.Keys | Sort-Object) | Should -Be @(
            'agent_id', 'current_operation_id', 'elevated', 'engine_version', 'execute_enabled',
            'os_version', 'platform', 'powershell_version', 'winget'
        )
        $heartbeat.execute_enabled | Should -BeFalse
        $heartbeat.engine_version | Should -Be '0.5.0'
        $heartbeat.elevated | Should -BeOfType [bool]
    }
}

Describe 'Start-DeployForgeAgent' {
    It 'refuses a non-loopback API address' -Skip:(-not $IsWindows) {
        { Start-DeployForgeAgent -ApiBaseUrl 'http://example.com:8000' } | Should -Throw -ExpectedMessage '*local http address*'
    }

    It 'refuses to start outside Windows' -Skip:$IsWindows {
        { Start-DeployForgeAgent } | Should -Throw -ExpectedMessage '*only on Windows*'
    }
}
