import argparse
import os
import shutil
import sys
import tempfile
import logging
import threading

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

def generate_data(model_output):
    for item in model_output:
        yield (item["tts_speech"].numpy() * (2 ** 15)).astype("int16").tobytes()

def generate_data_with_cleanup(model_output, path):
    inference_lock.acquire()
    try:
        yield from generate_data(model_output)
    finally:
        inference_lock.release()
        try:
            os.remove(path)
        except FileNotFoundError:
            pass

@app.post("/inference_cross_lingual")
async def inference_cross_lingual(tts_text: str = Form(), prompt_wav: UploadFile = File()):
    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        with open(path, "wb") as target:
            shutil.copyfileobj(prompt_wav.file, target)
        # The generator is consumed by StreamingResponse later. The lock is
        # therefore acquired in generate_data_with_cleanup and held until the
        # full audio stream has been emitted.
        model_output = cosyvoice.inference_cross_lingual(tts_text, path)
        return StreamingResponse(generate_data_with_cleanup(model_output, path))
    except Exception:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        raise

@app.get("/docs")
async def docs_probe():
    return {"status": "ok"}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=50000)
    parser.add_argument("--model_dir", type=str, default="iic/CosyVoice2-0.5B")
    args = parser.parse_args()
    cosyvoice = AutoModel(model_dir=args.model_dir)
    uvicorn.run(app, host="0.0.0.0", port=args.port)
