# Offline bundle handoff

The separately distributed archive is amagi_news_simulation_complete_offline.zip.
It is intentionally excluded from Git; it is approximately 30.5 GB.
The adjacent .zip.sha256 file records its SHA-256 checksum.

Extract the archive and run start.ps1 from the amagi_news_simulation directory.
The application uses localhost:3002 and the realtime gateway uses port 3001.
The extracted README.md documents Docker Desktop, NVIDIA GPU and storage
requirements. Run check-health.ps1 after startup.

The bundle contains all three fixed demos, application source, service images
and cached AI models. A fresh recording-to-export run on the destination PC
has not been verified; passing saved-demo tests does not establish that result.
