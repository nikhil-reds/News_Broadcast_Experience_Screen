$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

if (Test-Path -LiteralPath "offline-images.tar") {
    docker image load --input offline-images.tar
    if ($LASTEXITCODE -ne 0) { throw "Could not load offline-images.tar." }
}

docker compose up --detach --pull never
if ($LASTEXITCODE -ne 0) { throw "The services did not start." }

docker compose ps
Write-Host "Amagi News Simulation: http://localhost:8000"
