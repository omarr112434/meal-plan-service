# Used by START.bat: makes backend\.env from backend\.env.example with a new random JWT secret.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$example = Join-Path (Join-Path $root 'backend') '.env.example'
$target = Join-Path (Join-Path $root 'backend') '.env'

if (Test-Path $target) {
    Write-Host ' backend\.env already exists, leaving it as it is.'
    exit 0
}

$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })

(Get-Content $example) -replace '^JWT_SECRET=.*', "JWT_SECRET=$secret" | Set-Content -Encoding ascii $target
Write-Host ' Created backend\.env with a new secret (it never goes to GitHub).'
