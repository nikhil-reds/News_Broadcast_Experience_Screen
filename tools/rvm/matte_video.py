import argparse
import json
import time
from pathlib import Path

import cv2
import numpy as np
import torch


def choose_device(requested: str) -> torch.device:
    if requested == "auto":
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")
    return torch.device(requested)


def tensor_to_bgr(frame: torch.Tensor) -> np.ndarray:
    image = frame.detach().cpu().clamp(0, 1).numpy()
    image = np.transpose(image, (1, 2, 0))
    image = (image * 255).astype(np.uint8)
    return cv2.cvtColor(image, cv2.COLOR_RGB2BGR)


def tensor_to_gray(frame: torch.Tensor) -> np.ndarray:
    image = frame.detach().cpu().clamp(0, 1).numpy()
    image = np.squeeze(image)
    return (image * 255).astype(np.uint8)


def open_writer(path: str, fourcc: int, fps: float, size: tuple[int, int], is_color: bool) -> cv2.VideoWriter:
    writer = cv2.VideoWriter(path, fourcc, fps, size, is_color)
    if not writer.isOpened():
        raise RuntimeError(f"Could not open video writer for {path}")
    return writer


def load_model(model: str, model_path: str | None, device: torch.device):
    if model_path:
        loaded = torch.jit.load(model_path, map_location=device)
    else:
        model_name = "resnet50" if model == "resnet50" else "mobilenetv3"
        loaded = torch.hub.load("PeterL1n/RobustVideoMatting", model_name, pretrained=True)
    return loaded.to(device).eval()


def main():
    parser = argparse.ArgumentParser(description="Run Robust Video Matting over a video.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--foreground", required=True)
    parser.add_argument("--alpha", required=True)
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--model", default="mobilenetv3", choices=["mobilenetv3", "resnet50"])
    parser.add_argument("--model-path")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--downsample-ratio", type=float, default=0.25)
    args = parser.parse_args()

    started = time.time()
    device = choose_device(args.device)
    model = load_model(args.model, args.model_path, device)

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open input video {args.input}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    Path(args.foreground).parent.mkdir(parents=True, exist_ok=True)
    Path(args.alpha).parent.mkdir(parents=True, exist_ok=True)
    Path(args.metadata).parent.mkdir(parents=True, exist_ok=True)

    fourcc = cv2.VideoWriter_fourcc(*"FFV1")
    foreground_writer = open_writer(args.foreground, fourcc, fps, (width, height), True)
    alpha_writer = open_writer(args.alpha, fourcc, fps, (width, height), False)

    rec = [None, None, None, None]
    frames_written = 0
    alpha_sum = 0.0
    alpha_min = 1.0
    alpha_max = 0.0

    try:
        with torch.inference_mode():
            while True:
                ok, bgr = cap.read()
                if not ok:
                    break

                rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                src = torch.from_numpy(rgb).to(device=device, dtype=torch.float32) / 255.0
                src = src.permute(2, 0, 1).unsqueeze(0)

                fgr, pha, *rec = model(src, *rec, downsample_ratio=args.downsample_ratio)
                foreground = tensor_to_bgr(fgr[0])
                alpha = tensor_to_gray(pha[0])

                foreground_writer.write(foreground)
                alpha_writer.write(alpha)

                alpha_float = alpha.astype(np.float32) / 255.0
                alpha_sum += float(alpha_float.mean())
                alpha_min = min(alpha_min, float(alpha_float.min()))
                alpha_max = max(alpha_max, float(alpha_float.max()))
                frames_written += 1

                if frames_written % 150 == 0:
                    print(f"processed {frames_written}/{total_frames or '?'} frames", flush=True)
    finally:
        cap.release()
        foreground_writer.release()
        alpha_writer.release()

    if frames_written == 0:
        raise RuntimeError("RVM wrote zero frames")

    metadata = {
        "engine": "rvm",
        "model": args.model,
        "device": str(device),
        "downsampleRatio": args.downsample_ratio,
        "width": width,
        "height": height,
        "fps": fps,
        "sourceFrameCount": total_frames,
        "framesWritten": frames_written,
        "alphaMean": alpha_sum / frames_written,
        "alphaMin": alpha_min,
        "alphaMax": alpha_max,
        "elapsedSeconds": round(time.time() - started, 3),
    }

    if metadata["alphaMean"] <= 0.001:
        raise RuntimeError("RVM alpha appears empty")
    if metadata["alphaMean"] >= 0.999:
        raise RuntimeError("RVM alpha appears fully opaque")

    Path(args.metadata).write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps(metadata), flush=True)


if __name__ == "__main__":
    main()
