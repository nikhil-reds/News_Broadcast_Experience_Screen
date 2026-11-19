import argparse
import os
import shutil
import sys
import tempfile
import logging
import threading
import time
import uuid

try:
    import torch
except ImportError:  # pragma: no cover - the service image always includes torch
    torch = None

from fastapi import FastAPI, UploadFile, Form, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

logging.getLogger("matplotlib").setLevel(logging.WARNING)
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(ROOT_DIR, "CosyVoice"))
sys.path.append(os.path.join(ROOT_DIR, "CosyVoice", "third_party", "Matcha-TTS"))
from cosyvoice.cli.cosyvoice import AutoModel

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
# CosyVoice2 is a single CPU-bound model. Concurrent language requests compete
# for the same model and make each request slower until the caller times out.
# Hold this lock for the complete streaming response, not only model creation.
inference_lock = threading.Lock()
metrics = {
    "requests_total": 0,
    "requests_completed": 0,
    "requests_failed": 0,
    "busy_requests": 0,
    "total_inference_ms": 0,
}


def runtime_device():
    requested = os.getenv("COSYVOICE_DEVICE", "auto").lower()
    cuda_available = bool(torch is not None and torch.cuda.is_available())
    if requested == "cuda" and not cuda_available:
        return "cpu", "requested_cuda_unavailable"
    if requested in {"cpu", "cuda"}:
        return requested, None
    return ("cuda" if cuda_available else "cpu"), None


def runtime_info():
    device, warning = runtime_device()
    info = {"device": device, "cuda_available": bool(torch is not None and torch.cuda.is_available())}
    if torch is not None and torch.cuda.is_available():
        info["gpu_name"] = torch.cuda.get_device_name(0)
        info["cuda_version"] = torch.version.cuda
    loaded = globals().get("cosyvoice")
    if loaded is not None:
        model = getattr(loaded, "model", None)
        info["model_device"] = str(getattr(model, "device", "unknown"))
        try:
            info["model_tensor_device"] = str(next(model.llm.parameters()).device)
        except (AttributeError, StopIteration):
            info["model_tensor_device"] = "unknown"
    if warning:
        info["warning"] = warning
    return info

def generate_data(model_output):
    for item in model_output:
        yield (item["tts_speech"].numpy() * (2 ** 15)).astype("int16").tobytes()

def generate_data_with_cleanup(model_output, path):
    started = time.time()
    metrics["busy_requests"] += 1
    inference_lock.acquire()
    try:
        yield from generate_data(model_output)
        metrics["requests_completed"] += 1
    finally:
        inference_lock.release()
        metrics["busy_requests"] = max(0, metrics["busy_requests"] - 1)
        metrics["total_inference_ms"] += int((time.time() - started) * 1000)
        try:
            os.remove(path)
        except FileNotFoundError:
            pass

@app.post("/inference_cross_lingual")
async def inference_cross_lingual(tts_text: str = Form(), prompt_wav: UploadFile = File()):
    metrics["requests_total"] += 1
    request_id = str(uuid.uuid4())
    queued_at = time.time()
    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        with open(path, "wb") as target:
            shutil.copyfileobj(prompt_wav.file, target)
        # The generator is consumed by StreamingResponse later. The lock is
        # therefore acquired in generate_data_with_cleanup and held until the
        # full audio stream has been emitted.
        model_output = cosyvoice.inference_cross_lingual(tts_text, path)
        response = StreamingResponse(generate_data_with_cleanup(model_output, path))
        response.headers["X-CosyVoice-Request-Id"] = request_id
        response.headers["X-CosyVoice-Queue-Ms"] = str(int((time.time() - queued_at) * 1000))
        return response
    except Exception:
        metrics["requests_failed"] += 1
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        raise

@app.get("/docs")
async def docs_probe():
    return {"status": "ok", "service": "cosyvoice", **runtime_info()}

@app.get("/health")
async def health_probe():
    return {"status": "ready", "model_loaded": "cosyvoice" in globals(), **runtime_info()}

@app.get("/metrics")
async def metrics_probe():
    completed = metrics["requests_completed"]
    return {**metrics, "average_inference_ms": int(metrics["total_inference_ms"] / completed) if completed else 0}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=50000)
    parser.add_argument("--model_dir", type=str, default="iic/CosyVoice2-0.5B")
    args = parser.parse_args()
    device, warning = runtime_device()
    if warning:
        raise RuntimeError("COSYVOICE_DEVICE=cuda was requested but CUDA is unavailable")
    cosyvoice = AutoModel(model_dir=args.model_dir, fp16=device == "cuda")
    logging.getLogger(__name__).info(
        "CosyVoice ready device=%s gpu=%s cuda=%s model=%s; inference is serialized in the dedicated service",
        device,
        torch.cuda.get_device_name(0) if torch is not None and torch.cuda.is_available() else "none",
        torch.version.cuda if torch is not None and torch.cuda.is_available() else "none",
        args.model_dir,
    )
    uvicorn.run(app, host="0.0.0.0", port=args.port)
