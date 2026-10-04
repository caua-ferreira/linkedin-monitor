# Modo loop (padrão): roda indefinidamente a cada 5 min
# Modo once: npm run scheduler -- --once  (útil para Task Scheduler do Windows)
param([switch]$Once)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    if ($Once) {
        & npm.cmd run scheduler -- --once
    } else {
        & npm.cmd run scheduler
    }
    $runExitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}
exit $runExitCode
