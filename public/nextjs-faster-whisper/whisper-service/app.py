import os
import tempfile
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from faster_whisper import WhisperModel
import requests

MODEL_NAME = os.getenv("WHISPER_MODEL", "small")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv(
    "WHISPER_COMPUTE_TYPE",
    "int8" if DEVICE == "cpu" else "float16",
)
QWEN_API_URL = os.getenv("QWEN_API_URL", "http://qwen:11434")
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen2.5:3b")
QWEN_TIMEOUT_SECONDS = float(os.getenv("QWEN_TIMEOUT_SECONDS", "300"))

app = FastAPI(title="Local Faster Whisper API", version="1.0.0")

# Loaded once when the container starts.
model = WhisperModel(
    MODEL_NAME,
    device=DEVICE,
    compute_type=COMPUTE_TYPE,
)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "qwen_model": QWEN_MODEL,
    }


def transcribe_audio(
    audio_path: str,
    language: str | None,
    task: str,
) -> dict:
    if task not in {"transcribe", "translate"}:
        raise HTTPException(
            status_code=400,
            detail="task must be 'transcribe' or 'translate'",
        )

    segments, info = model.transcribe(
        audio_path,
        language=language or None,
        task=task,
        beam_size=5,
        vad_filter=True,
        word_timestamps=True,
    )

    output_segments = []
    full_text = []

    # segments is a generator; iterate once to execute transcription.
    for segment in segments:
        text = segment.text.strip()
        full_text.append(text)
        output_segments.append({
            "id": segment.id,
            "start": round(segment.start, 3),
            "end": round(segment.end, 3),
            "text": text,
            "words": [
                {
                    "start": round(word.start, 3) if word.start is not None else None,
                    "end": round(word.end, 3) if word.end is not None else None,
                    "word": word.word,
                    "probability": round(word.probability, 4),
                }
                for word in (segment.words or [])
            ],
        })

    return {
        "text": " ".join(full_text),
        "language": info.language,
        "language_probability": round(info.language_probability, 4),
        "duration": round(info.duration, 3),
        "task": task,
        "segments": output_segments,
    }


def qwen_process(text: str, instruction: str, target_language: str | None) -> dict:
    if not text.strip():
        return {"text": "", "model": QWEN_MODEL}

    prompt_parts = [
        "You are a precise broadcast transcript assistant.",
        "Return only the processed text. Do not add commentary.",
        f"Instruction: {instruction.strip()}",
    ]

    if target_language:
        prompt_parts.append(f"Target language: {target_language.strip()}")

    prompt_parts.append(f"Transcript:\n{text}")

    try:
        response = requests.post(
            f"{QWEN_API_URL.rstrip('/')}/api/generate",
            json={
                "model": QWEN_MODEL,
                "prompt": "\n\n".join(prompt_parts),
                "stream": False,
                "options": {
                    "temperature": 0.2,
                    "num_ctx": 8192,
                },
            },
            timeout=QWEN_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Qwen processing failed: {exc}",
        ) from exc

    body = response.json()
    return {
        "text": body.get("response", "").strip(),
        "model": body.get("model", QWEN_MODEL),
    }


async def save_upload(file: UploadFile) -> str:
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
        while chunk := await file.read(1024 * 1024):
            temp.write(chunk)
        return temp.name


@app.post("/transcribe")
async def transcribe(
    file: Annotated[UploadFile, File(...)],
    language: Annotated[str | None, Form()] = None,
    task: Annotated[str, Form()] = "transcribe",
) -> dict:
    temp_path: str | None = None

    try:
        temp_path = await save_upload(file)
        return transcribe_audio(temp_path, language, task)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        await file.close()
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/process")
async def process(
    file: Annotated[UploadFile, File(...)],
    language: Annotated[str | None, Form()] = None,
    task: Annotated[str, Form()] = "transcribe",
    instruction: Annotated[str, Form()] = (
        "Translate the transcript into clear English and lightly clean grammar."
    ),
    target_language: Annotated[str | None, Form()] = "English",
) -> dict:
    temp_path: str | None = None

    try:
        temp_path = await save_upload(file)
        transcript = transcribe_audio(temp_path, language, task)
        qwen = qwen_process(transcript["text"], instruction, target_language)
        return {
            **transcript,
            "qwen": qwen,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        await file.close()
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
