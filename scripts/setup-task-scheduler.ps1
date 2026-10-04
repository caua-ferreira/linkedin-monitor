# Registra a tarefa "LinkedIn Scheduler" no Agendador de Tarefas do Windows.
# Executa UMA VEZ a cada 5 min com --once (auto-recuperação se travar).
# Execute este script como Administrador uma única vez.

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$scriptPath  = Join-Path $projectRoot 'scripts\start-scheduler.ps1'
$nodePath    = (Get-Command node -ErrorAction Stop).Source
$npmPath     = (Get-Command npm  -ErrorAction Stop).Source

$action  = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NonInteractive -File `"$scriptPath`" -Once" `
    -WorkingDirectory $projectRoot

$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -Once -At (Get-Date)

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 4) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName   'LinkedIn Scheduler' `
    -Action     $action `
    -Trigger    $trigger `
    -Settings   $settings `
    -Description 'Publica posts do LinkedIn agendados via Notion' `
    -Force

Write-Host "Tarefa 'LinkedIn Scheduler' registrada com sucesso."
Write-Host "Verifique em: Agendador de Tarefas > Biblioteca do Agendador de Tarefas"
