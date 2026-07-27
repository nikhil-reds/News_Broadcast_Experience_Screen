# Next.js + faster-whisper Small + Qwen 3B + Docker

## Start

From the repository root:

```bash
cd /Users/nikhil/Desktop/News_Broadcast_Experience_Screen
docker compose up --build
```

The first startup downloads:

- Faster Whisper `small` into the `whisper-models` Docker volume
- Qwen `qwen2.5:3b` into the `qwen-models` Docker volume through Ollama

Open:

- Web UI: http://localhost:3000
- Whisper API health: http://localhost:8000/health
- Qwen/Ollama API: http://localhost:11434

## Test API directly

```bash
curl -X POST http://localhost:8000/transcribe \
  -F "file=@sample.mp3" \
  -F "task=transcribe"
```

Run Whisper Small first, then Qwen 3B translation or cleanup:

```bash
curl -X POST http://localhost:8000/process \
  -F "file=@sample.mp3" \
  -F "task=transcribe" \
  -F "target_language=English" \
  -F "instruction=Translate the transcript into clear English and lightly clean grammar."
```

## CPU defaults

- Whisper model: `small`
- Device: `cpu`
- Compute type: `int8`
- Qwen model: `qwen2.5:3b`

## NVIDIA GPU

Install NVIDIA Container Toolkit on the Linux host, then change the Whisper
service environment to:

```yaml
WHISPER_DEVICE: cuda
WHISPER_COMPUTE_TYPE: float16
```

and add:

```yaml
gpus: all
```

under the `whisper` service.

## Important

Whisper's `translate` task translates supported source speech into English only.
For German, Japanese, Hindi, or other target languages, send the returned text
to Qwen by using the web UI's Qwen processing controls or the `/process` API.
