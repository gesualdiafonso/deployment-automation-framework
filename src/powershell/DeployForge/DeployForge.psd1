@{
    RootModule        = 'DeployForge.psm1'
    ModuleVersion     = '0.4.0'
    GUID              = 'b3f1c2d4-5e6a-4f78-9a0b-1c2d3e4f5a6b'
    Author            = 'DeployForge'
    Description       = 'Catalog-driven Windows application deployment engine.'
    PowerShellVersion = '7.2'
    FunctionsToExport = @(
        'Get-DeployForgeApplication'
        'Get-DeployForgeDeploymentPlan'
        'Invoke-DeployForgeDeployment'
    )
    CmdletsToExport   = @()
    VariablesToExport = @()
    AliasesToExport   = @()
}
