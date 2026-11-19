import hashlib
import io
import json
import os
import threading
from importlib.metadata import version
from pathlib import Path

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
import soundfile as sf
import torch
from fastapi import FastAPI, Form, HTTPException
from fastapi.responses import Response
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

app = FastAPI(title="Local Chatterbox V3 voices")
DEVICE = os.getenv("CHATTERBOX_DEVICE", "cuda")
MODEL_DIR = Path(os.environ["CHATTERBOX_MODEL_DIR"])
VOICE_DIR = Path(os.getenv("CHATTERBOX_VOICE_DIR", "/app/voices"))
CHECKPOINT = "t3_mtl23ls_v3.safetensors"
REVISION = "5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18"
SOURCE_REVISION = "5de7a54aa4e5e2baadb0182dde554908b48b85c2"
VOICES = {
    "indian-male-01": "6064365011d6f5910804abba0d4d0cbf51fffb42e456ce401c23b19e93a39aaa",
    "indian-female-01": "9c7b33b970b816982900a3b86e90590fe7834b7d07b45f5061a16e7c609efb6d",
}
tts = None
manifest = None
inference_lock = threading.Lock()

@app.on_event("startup")
def load_model():
    global tts, manifest
    manifest = json.loads((MODEL_DIR / "local-manifest.json").read_text())
    if manifest["revision"] != REVISION or manifest["checkpoint"] != CHECKPOINT:
        raise RuntimeError("Pinned V3 model manifest does not match")
    for filename, expected in manifest["files"].items():
        actual = hashlib.sha256((MODEL_DIR / filename).read_bytes()).hexdigest()
        if actual != expected:
            raise RuntimeError(f"Model checksum mismatch: {filename}")
    for voice_id, expected in VOICES.items():
        if hashlib.sha256((VOICE_DIR / f"{voice_id}.wav").read_bytes()).hexdigest() != expected:
            raise RuntimeError(f"Reference checksum mismatch: {voice_id}")
    if DEVICE == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but unavailable")
    tts = ChatterboxMultilingualTTS.from_local(MODEL_DIR, device=DEVICE, t3_model="v3")

@app.get("/health")
def health():
    return {"status": "ready" if tts is not None else "loading", "model": "chatterbox-multilingual-v3",
            "checkpoint": CHECKPOINT, "revision": REVISION, "sourceRevision": SOURCE_REVISION,
            "checkpointSha256": manifest["files"][CHECKPOINT] if manifest else None,
            "packageVersion": version("chatterbox-tts"), "device": DEVICE, "offline": True,
            "voices": list(VOICES)}

@app.post("/synthesize")
def synthesize(text: str = Form(...), language_id: str = Form(...),
               voice_id: str = Form(...), model: str = Form("chatterbox-multilingual-v3"),
               exaggeration: float = Form(0.5), cfg_weight: float = Form(0.5)):
    if tts is None:
        raise HTTPException(503, "Model is still loading")
    if model != "chatterbox-multilingual-v3":
        raise HTTPException(400, "Requested model is not loaded")
    if language_id not in ("hi", "de", "fr", "es") or voice_id not in VOICES:
        raise HTTPException(400, "Unsupported language or voice")
    if not text.strip() or len(text) > 4000:
        raise HTTPException(400, "Text must contain 1-4000 characters")
    if exaggeration != 0.5 or cfg_weight != 0.5:
        raise HTTPException(400, "This cached voice version uses fixed synthesis settings")
    # Conditioning is mutable: serialize all voices and languages.
    with inference_lock, torch.inference_mode():
        wav = tts.generate(text, language_id=language_id,
                           audio_prompt_path=str(VOICE_DIR / f"{voice_id}.wav"),
                           exaggeration=exaggeration, cfg_weight=cfg_weight)
        output = io.BytesIO()
        sf.write(output, wav.detach().cpu().squeeze().numpy(), tts.sr, format="WAV", subtype="PCM_16")
    return Response(output.getvalue(), media_type="audio/wav", headers={
        "X-Chatterbox-Checkpoint": CHECKPOINT, "X-Chatterbox-Revision": REVISION, "X-Voice-Id": voice_id})

