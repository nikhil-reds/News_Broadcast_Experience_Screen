# CosyVoice 2 text-to-speech service.
#
# Clones the official FunAudioLLM/CosyVoice repo (which contains CosyVoice2
# support) and runs its bundled FastAPI runtime server. Pretrained weights
# (default: iic/CosyVoice2-0.5B) are downloaded on first start via ModelScope
# into /root/.cache, which is mounted as a named volume in compose.yaml so the
# download only happens once.
FROM pytorch/pytorch:2.0.1-cuda11.7-cudnn8-runtime
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /opt/CosyVoice

RUN apt-get update -y && apt-get install -y --no-install-recommends \
    git git-lfs unzip g++ curl sox libsox-dev \
    && git lfs install \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git

WORKDIR /opt/CosyVoice/CosyVoice

# requirements.txt pulls in legacy setup.py-only packages (e.g. openai-whisper)
# that break under pip's isolated build environment when it grabs the latest
# setuptools (which no longer bundles pkg_resources). Constrain setuptools for
# ALL pip resolutions in this layer, including isolated build subprocesses.
RUN echo "setuptools<81" > /tmp/constraints.txt
ENV PIP_CONSTRAINT=/tmp/constraints.txt

# requirements.txt embeds its own --extra-index-url lines (CUDA 12.1 wheels +
# an Azure DevOps Artifacts onnxruntime-cuda-12 mirror) that pip keeps
# consulting even with a CLI --index-url override, and that mirror stalls
# from this network. It also pulls deepspeed (training-only, needs a CUDA
# toolchain to compile) and onnxruntime-gpu/tensorrt-cu12 (opt-in inference
# acceleration, unused by the default FastAPI server path) — none of which
# this CPU-inference deployment needs. Strip them and use a clean CPU
# onnxruntime instead.
RUN sed -i \
    -e '/^--extra-index-url/d' \
    -e '/^deepspeed/d' \
    -e '/^onnxruntime/d' \
    -e '/^tensorrt-cu12/d' \
    requirements.txt \
    && echo "onnxruntime==1.18.0" >> requirements.txt

# --extra-index-url here is PyTorch's own official CPU-wheel index (fast,
# reliable) so torch==2.3.1/torchaudio==2.3.1 resolve to small CPU builds.
RUN pip3 install --no-cache-dir \
    --index-url https://pypi.org/simple/ \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    -r requirements.txt

EXPOSE 50000

HEALTHCHECK --interval=15s --timeout=5s --start-period=600s --retries=20 \
  CMD curl -f http://localhost:50000/docs || exit 1

# --model_dir is a ModelScope hub id (not a local path); the server downloads
# it automatically on first run into the cache mounted at /root/.cache.
CMD ["python3", "runtime/python/fastapi/server.py", "--port", "50000", "--model_dir", "iic/CosyVoice2-0.5B"]
