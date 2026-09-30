#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Libera o OAuth local do antigravity-gateway no Windows Defender Firewall.
.DESCRIPTION
  O fluxo `npm run accounts:add` escuta SOMENTE em loopback (127.0.0.1),
  então normalmente o Defender nem pergunta. Este script é o "plano B":
  cria uma regra de entrada permitindo o Node.js nas portas de callback
  (51121 + fallbacks 53682, 49152, 54321, 62000, 63000), eliminando
  EACCES / prompts futuros. Execute 1x como Administrador.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\setup-windows-firewall.ps1
#>
$ErrorActionPreference = 'Stop'

$ports = @(51121, 53682, 49152, 54321, 62000, 63000)
$ruleName = 'Antigravity Gateway - OAuth loopback (Node.js)'

# Remove regra antiga com mesmo nome (idempotente)
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue

# Descobre o node.exe atual
$nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { $nodeExe = "$env:ProgramFiles\nodejs\node.exe" }

$params = @{
  DisplayName  = $ruleName
  Description  = 'Permite callback OAuth local (loopback 127.0.0.1) do antigravity-gateway. Nao expoe nada a rede.'
  Direction    = 'Inbound'
  Action       = 'Allow'
  Protocol     = 'TCP'
  LocalPort    = ($ports -join ',')
  RemoteAddress = '127.0.0.1'
  Profile      = 'Any'
  Enabled      = 'True'
}
if ($nodeExe -and (Test-Path $nodeExe)) { $params['Program'] = $nodeExe }

New-NetFirewallRule @params | Out-Null

Write-Host ''
Write-Host 'OK - Regra criada:' $ruleName -ForegroundColor Green
Write-Host ('Portas loopback liberadas: ' + ($ports -join ', '))
if ($params.ContainsKey('Program')) { Write-Host ('Programa: ' + $params['Program']) }
Write-Host 'Agora rode normalmente (sem admin): npm run accounts:add'
Write-Host ''
Write-Host 'Faixas reservadas pelo Hyper-V (se alguma porta acima estiver aqui, o fallback automatico usa outra):'
netsh interface ipv4 show excludedportrange protocol=tcp
