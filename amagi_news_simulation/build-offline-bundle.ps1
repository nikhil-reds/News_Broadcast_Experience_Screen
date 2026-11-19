$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

if (-not (Test-Path -LiteralPath "source\package.json")) {
    throw "The source folder is missing. Copy the project snapshot into .\source first."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Docker is not running. Start Docker Desktop (Linux containers), then run this script again."
}

docker build --file Dockerfile --tag amagi-news-simulation:offline source
if ($LASTEXITCODE -ne 0) { throw "Application image build failed." }

docker pull postgres:16-bookworm
if ($LASTEXITCODE -ne 0) { throw "Could not pull PostgreSQL image." }
docker pull redis:7-alpine
if ($LASTEXITCODE -ne 0) { throw "Could not pull Redis image." }
docker pull quay.io/minio/minio:latest
if ($LASTEXITCODE -ne 0) { throw "Could not pull MinIO image." }

docker image save --output offline-images.tar `
    amagi-news-simulation:offline `
    postgres:16-bookworm `
    redis:7-alpine `
    quay.io/minio/minio:latest
if ($LASTEXITCODE -ne 0) { throw "Could not create offline-images.tar." }

Write-Host "Offline bundle is ready: $PSScriptRoot\offline-images.tar"
