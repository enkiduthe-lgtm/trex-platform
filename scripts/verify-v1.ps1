param([string]$PgliteModule)
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $repoPath
$previousPglite = $env:PGLITE_MODULE
function Invoke-CheckedNode([string[]]$NodeArgs) {
    & node @NodeArgs
    if ($LASTEXITCODE -ne 0) { throw "V1 verification failed: $($NodeArgs -join ' ')" }
}
try {
    if ($PgliteModule) { $env:PGLITE_MODULE = $PgliteModule }
    Invoke-CheckedNode @('node_modules/jest/bin/jest.js','--config','apps/api/jest.config.js','--runInBand')
    foreach ($application in @('api','admin','web','dealer')) {
        Invoke-CheckedNode @('node_modules/typescript/bin/tsc','--noEmit','--incremental','false','-p',"apps/$application/tsconfig.json")
    }
    foreach ($check in @('test-v1-migrations','test-v1-flow','test-public-pricing','test-admin-order','test-paytr-cash','test-expired-reservations','test-customer-totals','test-audit-list','test-admin-logout','test-admin-async-controls')) {
        Invoke-CheckedNode @("apps/api/scripts/$check.cjs")
    }
    & git diff --check
    if ($LASTEXITCODE -ne 0) { throw 'Whitespace verification failed' }
    Write-Output 'V1 local verification passed. This is not a production deployment or a hosted PostgreSQL/Redis acceptance test.'
} finally {
    if ($null -eq $previousPglite) { Remove-Item Env:PGLITE_MODULE -ErrorAction SilentlyContinue }
    else { $env:PGLITE_MODULE = $previousPglite }
    Pop-Location
}
