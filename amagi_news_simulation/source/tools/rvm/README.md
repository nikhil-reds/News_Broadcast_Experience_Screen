# Local RVM Setup

Screen 7 can use Robust Video Matting locally when `GREEN_SCREEN_ENGINE=rvm`.

Install dependencies into the Python environment used by `RVM_PYTHON`:

```bash
pip install -r tools/rvm/requirements.txt
python tools/rvm/download-model.py --model mobilenetv3
```

Useful environment variables:

```env
GREEN_SCREEN_ENGINE=rvm
GREEN_SCREEN_FALLBACK_CHROMAKEY=true
GREEN_SCREEN_MATTING_VERSION=rvm-v1
RVM_PYTHON=python
RVM_SCRIPT=tools/rvm/matte_video.py
RVM_MODEL=mobilenetv3
RVM_DEVICE=auto
RVM_DOWNSAMPLE_RATIO=0.25
RVM_TIMEOUT_MS=60000
RVM_MATTE_WAIT_TIMEOUT_MS=60000
```

For an offline install, set `RVM_MODEL_PATH` to a local TorchScript model and keep
the same `GREEN_SCREEN_MATTING_VERSION` until you intentionally want to invalidate
old matte/composite caches.
