# Amagi News Simulation offline bundle

This folder runs the portable simulation at **http://localhost:8000**. Port
3005 is not used. The four core containers use `restart: unless-stopped`, so
they return automatically whenever Docker starts.

## Finish the bundle on the source PC

1. Install or start Docker Desktop with Linux containers enabled.
2. Open PowerShell in this folder.
3. Run:

   ```powershell
   .\build-offline-bundle.ps1
   ```

The command creates `offline-images.tar`. Copy this entire
`amagi_news_simulation` folder to the other PC. Keep `.env` private and change
its example passwords before using the system on an untrusted network.

## Run on the other PC

1. Install Docker Desktop and select **Start Docker Desktop when you sign in**
   under **Settings > General**.
2. Open PowerShell in this folder.
3. Run:

   ```powershell
   .\start.ps1
   ```

Or run the equivalent commands manually:

```powershell
docker image load -i offline-images.tar
docker compose up -d --pull never
docker compose ps
```

Open **http://localhost:8000**. To use another port, edit `APP_PORT` in `.env`.

## Data and limitations

PostgreSQL records, Redis state, and uploaded media are stored in Docker named
volumes on the destination PC. They survive container and Windows restarts.
They are not inside `offline-images.tar`, so transferring this folder does not
copy data created on the original PC.

This default offline bundle contains the four services needed for the UI and
the saved demonstration: web, PostgreSQL, Redis, and MinIO. The live AI media
pipeline (Whisper, Qwen, and speech synthesis) is intentionally not bundled;
those model images and caches are much larger and hardware-specific.
