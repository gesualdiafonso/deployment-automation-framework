@{
    RootModule        = 'DeployForgeAgent.psm1'
    ModuleVersion     = '0.1.0'
    GUID              = '5d2a9c7e-3b41-4f0e-8a6d-2c9e7f1b4a30'
    Author            = 'DeployForge'
    Description       = 'Local DeployForge agent: runs approved operations from the DeployForge API with the DeployForge engine.'
    PowerShellVersion = '7.2'
    FunctionsToExport = @(
        'Get-DeployForgeAgentWingetInfo'
        'Get-DeployForgeAgentHeartbeat'
        'Invoke-DeployForgeAgentOperation'
        'Start-DeployForgeAgent'
    )
    CmdletsToExport   = @()
    VariablesToExport = @()
    AliasesToExport   = @()
}
