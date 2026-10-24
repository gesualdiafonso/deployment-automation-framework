function Invoke-DeployForgeDeployment {
    <#
    .SYNOPSIS
        Resolves a catalog application and (for now) only simulates its deployment.
    .DESCRIPTION
        Real execution is not implemented in this version. With -WhatIf the plan is
        displayed; without it a warning is raised and nothing is changed.
    .EXAMPLE
        Invoke-DeployForgeDeployment -Id whatsapp -WhatIf
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType('DeployForge.DeploymentPlan')]
    param(
        [Parameter(Mandatory, Position = 0)]
        [string]$Id,

        [string]$RepositoryRoot = $script:DeployForgeRoot
    )

    $plan = Get-DeployForgeDeploymentPlan -Id $Id -RepositoryRoot $RepositoryRoot

    if (-not $plan.Supported) {
        throw "Cannot deploy '$Id': $($plan.Notes -join ' ')"
    }

    if ($PSCmdlet.ShouldProcess($plan.Name, $plan.Command)) {
        Write-Warning 'Execution is not implemented in this version. No changes were made.'
        $status = 'NotExecuted'
    }
    else {
        $status = 'Skipped'
    }

    $plan | Add-Member -NotePropertyName Status -NotePropertyValue $status -PassThru
}