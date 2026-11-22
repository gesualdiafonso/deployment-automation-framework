function Confirm-DeployForgeApplicationState {
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)]
        [string]$PackageId,

        [Parameter(Mandatory)]
        [ValidateSet('winget', 'msstore')]
        [string]$Source,

        [Parameter(Mandatory)]
        [bool]$Expected
    )

    $actual = Test-DeployForgeApplicationInstalled -PackageId $PackageId -Source $Source
    return ($actual -eq $Expected)
}
